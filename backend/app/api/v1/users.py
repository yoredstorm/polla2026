import uuid
from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select, func, and_

from app.api.deps import CurrentUser, DBSession, OptionalUser
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.core.security import generate_profile_bets_invite_code, hash_token
from app.models.bet import Bet
from app.models.user import User
from app.schemas.bet import BetOut
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.user import (
    BetsProfileMeResponse,
    BetsProfileUpdate,
    PublicUserSummary,
    UserOut,
)
from app.services.user_profile_service import can_show_bet_count, can_view_user_bets_list

router = APIRouter(prefix="/users", tags=["Users"])

# Stricter limit for guessing profile invite codes (per IP).
PROFILE_BETS_VIEW_RATE_LIMIT = "30/minute"


@router.get("/me", response_model=UserOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_me(request: Request, current_user: CurrentUser):
    return UserOut.model_validate(current_user)


async def _active_group_id(db: DBSession) -> uuid.UUID | None:
    from app.models.group import Group

    result = await db.execute(
        select(Group.id).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    return result.scalar_one_or_none()


@router.get("/me/badges")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_my_badges(request: Request, current_user: CurrentUser, db: DBSession):
    from app.services.gamification_service import compute_badges

    group_id = await _active_group_id(db)
    badges = await compute_badges(db, current_user.id, group_id=group_id)
    return {"badges": badges}


@router.get("/by-username/{username}/badges")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_user_badges_by_username(
    request: Request,
    username: str,
    db: DBSession,
    current_user: OptionalUser,
):
    from app.services.gamification_service import compute_badges

    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="User not found")

    if target.bets_profile_visibility == "invite_only":
        if not current_user or current_user.id != target.id:
            raise HTTPException(status_code=403, detail="Profile is private")

    group_id = await _active_group_id(db)
    return {"badges": await compute_badges(db, target.id, group_id=group_id)}


@router.get("/by-username/{username}/public", response_model=PublicUserSummary)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_user_public_summary(
    request: Request,
    username: str,
    db: DBSession,
):
    """Public read-only profile summary (no login required)."""
    result = await db.execute(select(User).where(User.username == username, User.is_active == True))  # noqa: E712
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    total_bets = None
    if target.bets_profile_visibility == "public":
        cnt = await db.execute(select(func.count()).select_from(Bet).where(Bet.user_id == target.id))
        total_bets = int(cnt.scalar() or 0)
    return PublicUserSummary(
        user_id=target.id,
        username=target.username,
        bets_profile_visibility=target.bets_profile_visibility,  # type: ignore[arg-type]
        total_bets=total_bets,
        show_bet_amounts=target.show_bet_amounts,
    )


@router.get("/by-username/{username}/summary", response_model=PublicUserSummary)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_user_summary_by_username(
    request: Request,
    username: str,
    current_user: CurrentUser,
    db: DBSession,
    invite_code: str | None = Query(None, description="Code required when profile is invite-only"),
):
    result = await db.execute(select(User).where(User.username == username))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    total_bets: int | None = None
    if can_show_bet_count(current_user.id, target, invite_code):
        cnt = await db.execute(select(func.count()).select_from(Bet).where(Bet.user_id == target.id))
        total_bets = int(cnt.scalar() or 0)

    return PublicUserSummary(
        user_id=target.id,
        username=target.username,
        bets_profile_visibility=target.bets_profile_visibility,  # type: ignore[arg-type]
        total_bets=total_bets,
        show_bet_amounts=target.show_bet_amounts,
    )


@router.get("/{user_id}/bets", response_model=PaginatedResponse[BetOut])
@limiter.limit(PROFILE_BETS_VIEW_RATE_LIMIT)
async def get_user_public_bets(
    request: Request,
    user_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
    invite_code: str | None = Query(None),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    if not can_view_user_bets_list(current_user.id, target, invite_code):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Cannot view this user's bets"}},
        )

    base = select(Bet).where(Bet.user_id == user_id)
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    list_result = await db.execute(base.order_by(Bet.created_at.desc()).offset((page - 1) * limit).limit(limit))
    bets = list_result.scalars().all()

    return PaginatedResponse(
        data=[BetOut.model_validate(b) for b in bets],
        pagination=PaginationMeta(total=total, page=page, limit=limit, total_pages=-(-total // limit) if total else 0),
    )


@router.patch("/me/bets-profile", response_model=BetsProfileMeResponse)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def update_my_bets_profile(
    request: Request,
    data: BetsProfileUpdate,
    current_user: CurrentUser,
    db: DBSession,
):
    new_plain: str | None = None

    if data.visibility == "public":
        current_user.bets_profile_visibility = "public"
        current_user.bets_profile_invite_hash = None
    else:
        current_user.bets_profile_visibility = "invite_only"
        need_new = data.rotate_code or not current_user.bets_profile_invite_hash
        if need_new:
            new_plain = generate_profile_bets_invite_code()
            current_user.bets_profile_invite_hash = hash_token(new_plain)

    if data.show_bet_amounts is not None:
        current_user.show_bet_amounts = data.show_bet_amounts

    from app.services.audit import log_action

    await log_action(
        db,
        user_id=current_user.id,
        action="profile_visibility_changed",
        detail={
            "visibility": current_user.bets_profile_visibility,
            "show_bet_amounts": current_user.show_bet_amounts,
            "rotate_code": bool(data.rotate_code),
        },
        ip=request.client.host if request.client else None,
    )

    await db.commit()
    await db.refresh(current_user)

    return BetsProfileMeResponse(
        bets_profile_visibility=current_user.bets_profile_visibility,  # type: ignore[arg-type]
        has_invite_code=bool(current_user.bets_profile_invite_hash),
        new_invite_code=new_plain,
        show_bet_amounts=current_user.show_bet_amounts,
    )
