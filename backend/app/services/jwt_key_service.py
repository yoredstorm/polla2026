"""
JWT signing key bootstrap, in-memory cache, and weekly rotation.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

import secrets
import structlog
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = structlog.get_logger(__name__)

Purpose = Literal["access", "refresh"]

# purpose -> list of (kid, secret) newest first
_keys_cache: dict[str, list[tuple[str, str]]] = {}


def get_signing_keys_for_purpose(purpose: Purpose) -> list[tuple[str, str]]:
    """Newest-first (current, then previous during grace)."""
    cached = _keys_cache.get(purpose)
    if cached:
        return cached
    return _legacy_keys(purpose)


def get_current_signing_key(purpose: Purpose) -> tuple[str, str]:
    keys = get_signing_keys_for_purpose(purpose)
    return keys[0]


def _legacy_keys(purpose: Purpose) -> list[tuple[str, str]]:
    if purpose == "access":
        return [("legacy-access", settings.JWT_SECRET_KEY)]
    return [("legacy-refresh", settings.JWT_REFRESH_SECRET)]


async def reload_signing_keys_cache(db: AsyncSession) -> None:
    from app.models.jwt_signing_key import JwtSigningKey

    global _keys_cache
    new_cache: dict[str, list[tuple[str, str]]] = {}
    for purpose in ("access", "refresh"):
        result = await db.execute(
            select(JwtSigningKey)
            .where(
                and_(
                    JwtSigningKey.purpose == purpose,
                    JwtSigningKey.revoked_at.is_(None),
                )
            )
            .order_by(JwtSigningKey.active_from.desc())
        )
        rows = result.scalars().all()
        if rows:
            new_cache[purpose] = [(r.kid, r.secret) for r in rows]
    if new_cache:
        _keys_cache = new_cache
    else:
        _keys_cache = {
            "access": _legacy_keys("access"),
            "refresh": _legacy_keys("refresh"),
        }


async def bootstrap_signing_keys(db: AsyncSession) -> None:
    """Seed DB from env when empty."""
    from app.models.jwt_signing_key import JwtSigningKey

    for purpose, secret in (
        ("access", settings.JWT_SECRET_KEY),
        ("refresh", settings.JWT_REFRESH_SECRET),
    ):
        result = await db.execute(
            select(JwtSigningKey).where(JwtSigningKey.purpose == purpose).limit(1)
        )
        if result.scalar_one_or_none():
            continue
        kid = f"bootstrap-{purpose}"
        db.add(
            JwtSigningKey(
                kid=kid,
                purpose=purpose,
                secret=secret,
                active_from=datetime.now(timezone.utc),
            )
        )
    await db.flush()


async def rotate_signing_keys_if_due(db: AsyncSession, redis) -> bool:
    """
    Promote new random keys weekly (production + enabled only).
    Returns True if rotation ran.
    """
    from app.models.jwt_signing_key import JwtSigningKey

    if not settings.jwt_rotation_enabled:
        return False

    lock_key = "jwt_key_rotation_lock"
    acquired = await redis.set(lock_key, "1", nx=True, ex=3600)
    if not acquired:
        return False

    try:
        rotated_any = False
        now = datetime.now(timezone.utc)
        rotation_delta = timedelta(days=settings.JWT_KEY_ROTATION_DAYS)
        grace_delta = timedelta(days=settings.JWT_KEY_GRACE_DAYS)

        for purpose in ("access", "refresh"):
            result = await db.execute(
                select(JwtSigningKey)
                .where(
                    and_(
                        JwtSigningKey.purpose == purpose,
                        JwtSigningKey.revoked_at.is_(None),
                    )
                )
                .order_by(JwtSigningKey.active_from.desc())
            )
            active = result.scalars().all()
            if active:
                latest_from = active[0].active_from
                if latest_from.tzinfo is None:
                    latest_from = latest_from.replace(tzinfo=timezone.utc)
                needs_rotation = (now - latest_from) >= rotation_delta
            else:
                needs_rotation = True
            if not needs_rotation:
                continue

            new_kid = f"{purpose}-{uuid.uuid4().hex[:16]}"
            new_secret = secrets.token_urlsafe(48)
            db.add(
                JwtSigningKey(
                    kid=new_kid,
                    purpose=purpose,
                    secret=new_secret,
                    active_from=now,
                )
            )
            await db.flush()

            # Keep current + previous; revoke older keys past grace
            if len(active) >= 2:
                for old in active[1:]:
                    old_start = old.active_from
                    if old_start.tzinfo is None:
                        old_start = old_start.replace(tzinfo=timezone.utc)
                    if now - old_start >= grace_delta:
                        old.revoked_at = now

            # If more than 2 still active, revoke all but newest 2
            result2 = await db.execute(
                select(JwtSigningKey)
                .where(
                    and_(
                        JwtSigningKey.purpose == purpose,
                        JwtSigningKey.revoked_at.is_(None),
                    )
                )
                .order_by(JwtSigningKey.active_from.desc())
            )
            still_active = result2.scalars().all()
            for extra in still_active[2:]:
                extra.revoked_at = now

            logger.info("jwt_keys_rotated", purpose=purpose, kid=new_kid)
            rotated_any = True

        if rotated_any:
            await reload_signing_keys_cache(db)
        return rotated_any
    finally:
        await redis.delete(lock_key)


async def jwt_key_rotation_loop() -> None:
    """Check daily whether weekly rotation is due."""
    from app.db.session import AsyncSessionLocal, get_redis

    while True:
        try:
            if settings.jwt_rotation_enabled:
                redis = await get_redis()
                async with AsyncSessionLocal() as db:
                    try:
                        if await rotate_signing_keys_if_due(db, redis):
                            await db.commit()
                        else:
                            await db.rollback()
                    except Exception:
                        await db.rollback()
                        raise
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("jwt_key_rotation_loop_failed")
        try:
            await asyncio.sleep(86400)  # daily check
        except asyncio.CancelledError:
            raise

