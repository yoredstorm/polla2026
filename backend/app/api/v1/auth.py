"""
Auth router — OWASP A07: Authentication Failures prevention.
"""
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Response, Request, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.security import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, decode_refresh_token, hash_token,
)
from app.core.config import settings
from app.core.rate_limiter import (
    limiter,
    AUTH_LOGIN_RATE_LIMIT,
    REGISTER_RATE_LIMIT,
    AUTH_REFRESH_RATE_LIMIT,
    CHANGE_PASSWORD_RATE_LIMIT,
)
from app.models.user import User, RefreshToken
from app.schemas.user import UserRegister, UserLogin, UserOut, ChangePassword
from app.services.audit import log_action
from app.services.notification_service import notify_admins, build_entry_pending
from app.models.group import Group, GroupMember
import structlog

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

BLOCK_DURATION = timedelta(seconds=settings.LOGIN_BLOCK_DURATION_SECONDS)
MAX_FAILED_ATTEMPTS = 5
_COOKIE_SECURE = settings.APP_ENV == "production"


def _auth_error_response(code: str, message: str, detail: str | None = None):
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"error": {"code": code, "message": message, "detail": detail}},
    )


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        samesite="strict",
        secure=_COOKIE_SECURE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        samesite="strict",
        secure=_COOKIE_SECURE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/", httponly=True, samesite="strict", secure=_COOKIE_SECURE)
    response.delete_cookie("refresh_token", path="/", httponly=True, samesite="strict", secure=_COOKIE_SECURE)


async def _revoke_all_user_refresh_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    result = await db.execute(
        select(RefreshToken).where(
            and_(RefreshToken.user_id == user_id, RefreshToken.revoked == False)  # noqa: E712
        )
    )
    for rt in result.scalars().all():
        rt.revoked = True


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(REGISTER_RATE_LIMIT)
async def register(request: Request, data: UserRegister, db: DBSession, redis: RedisClient):
    existing_username = await db.execute(select(User).where(User.username == data.username))

    if existing_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"error": {"code": "USER_EXISTS", "message": "Registration failed. Please try different credentials."}},
        )

    user = User(
        username=data.username,
        first_name=data.first_name,
        last_name=data.last_name,
        email=None,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    await log_action(db, user_id=user.id, action="register", ip=request.client.host if request.client else None)

    polla_res = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    active_polla = polla_res.scalar_one_or_none()
    if active_polla:
        member_res = await db.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == active_polla.id, GroupMember.user_id == user.id)
            )
        )
        if not member_res.scalar_one_or_none():
            title, body, payload = build_entry_pending(
                username=user.username,
                user_id=str(user.id),
                group_id=str(active_polla.id),
            )
            await notify_admins(
                db, redis, type="entry_pending", title=title, body=body, payload=payload,
            )

    logger.info("user_registered", user_id=str(user.id))
    return user


@router.post("/login", status_code=status.HTTP_200_OK)
@limiter.limit(AUTH_LOGIN_RATE_LIMIT)
async def login(request: Request, data: UserLogin, response: Response, db: DBSession):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    generic_error = _auth_error_response("INVALID_CREDENTIALS", "Invalid username or password")

    if not user:
        logger.warning("login_failed")
        raise generic_error

    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        logger.warning("login_attempted_locked_account", user_id=str(user.id))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "ACCOUNT_LOCKED", "message": "Account temporarily locked. Try again later."}},
        )

    if not verify_password(data.password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + BLOCK_DURATION
            logger.warning("account_locked", user_id=str(user.id))
        logger.warning("login_failed_bad_password", user_id=str(user.id))
        await db.flush()
        raise generic_error

    user.failed_login_attempts = 0
    user.locked_until = None

    await _revoke_all_user_refresh_tokens(db, user.id)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})

    rt = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(rt)
    await db.flush()

    _set_auth_cookies(response, access_token, refresh_token)

    await log_action(db, user_id=user.id, action="login", ip=request.client.host if request.client else None)
    logger.info("user_logged_in", user_id=str(user.id))
    return {"message": "Login successful", "user": UserOut.model_validate(user)}


@router.post("/refresh")
@limiter.limit(AUTH_REFRESH_RATE_LIMIT)
async def refresh_token(request: Request, response: Response, db: DBSession):
    refresh_token_cookie = request.cookies.get("refresh_token")
    if not refresh_token_cookie:
        raise _auth_error_response("NO_REFRESH_TOKEN", "Refresh token not found")

    payload = decode_refresh_token(refresh_token_cookie)
    if not payload:
        raise _auth_error_response("INVALID_REFRESH_TOKEN", "Invalid or expired refresh token")

    user_id = uuid.UUID(payload["sub"])
    token_hash = hash_token(refresh_token_cookie)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    stored_token = result.scalar_one_or_none()

    if stored_token and stored_token.revoked:
        await _revoke_all_user_refresh_tokens(db, user_id)
        await db.flush()
        logger.warning("refresh_token_reuse_detected", user_id=str(user_id))
        _clear_auth_cookies(response)
        raise _auth_error_response("INVALID_REFRESH_TOKEN", "Refresh token invalid or expired")

    if not stored_token:
        raise _auth_error_response("INVALID_REFRESH_TOKEN", "Refresh token invalid or expired")

    expires_at = stored_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise _auth_error_response("INVALID_REFRESH_TOKEN", "Refresh token invalid or expired")

    new_access = create_access_token({"sub": payload["sub"]})
    new_refresh = create_refresh_token({"sub": payload["sub"]})
    stored_token.token_hash = hash_token(new_refresh)
    stored_token.expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )
    stored_token.revoked = False
    await db.flush()

    _set_auth_cookies(response, new_access, new_refresh)
    return {"message": "Token refreshed"}


@router.post("/logout")
async def logout(request: Request, response: Response, db: DBSession):
    """Clears auth cookies. No auth required so stale sessions can always log out."""
    refresh_token_cookie = request.cookies.get("refresh_token")
    if refresh_token_cookie:
        try:
            token_hash = hash_token(refresh_token_cookie)
            result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
            stored = result.scalar_one_or_none()
            if stored:
                stored.revoked = True
                await db.commit()
        except Exception:
            logger.exception("logout_revoke_failed")

    _clear_auth_cookies(response)
    await log_action(db, user_id=None, action="logout", ip=request.client.host if request.client else None)
    logger.info("user_logged_out")
    return {"message": "Logged out successfully"}


@router.post("/change-password")
@limiter.limit(CHANGE_PASSWORD_RATE_LIMIT)
async def change_password(
    request: Request,
    data: ChangePassword,
    current_user: CurrentUser,
    db: DBSession,
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "WRONG_PASSWORD", "message": "Current password is incorrect"}},
        )
    current_user.hashed_password = hash_password(data.new_password)
    await _revoke_all_user_refresh_tokens(db, current_user.id)
    await log_action(db, user_id=current_user.id, action="change_password", ip=None)
    logger.info("password_changed", user_id=str(current_user.id))
    return {"message": "Password changed successfully"}
