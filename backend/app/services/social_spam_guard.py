"""Anti-spam for social writes (comments/reactions) with escalating mutes."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.core.config import settings
from app.models.user import User
from app.services.audit import log_action

# Burst: max comments in window before strike
SOCIAL_COMMENT_BURST_LIMIT = 8
SOCIAL_COMMENT_BURST_WINDOW_SEC = 120

# Escalation minutes per strike (1-indexed); strike 6+ uses last value (24h)
MUTE_MINUTES_BY_STRIKE = [30, 60, 120, 240, 480, 1440]


def _mute_duration(strike: int) -> timedelta:
    idx = min(max(strike, 1), len(MUTE_MINUTES_BY_STRIKE)) - 1
    return timedelta(minutes=MUTE_MINUTES_BY_STRIKE[idx])


def ensure_not_social_muted(user: User) -> None:
    now = datetime.now(timezone.utc)
    if user.social_muted_until and user.social_muted_until > now:
        retry = int((user.social_muted_until - now).total_seconds())
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "SOCIAL_MUTED",
                    "message": "Estas silenciado por actividad excesiva. Intenta mas tarde.",
                    "retry_after": retry,
                    "until": user.social_muted_until.isoformat(),
                }
            },
        )


async def record_comment_burst(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    user: User,
    *,
    ip: str | None = None,
) -> None:
    """Increment burst counter; apply mute if threshold exceeded."""
    ensure_not_social_muted(user)
    if not redis:
        return

    key = f"social:comment_burst:{user.id}"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, SOCIAL_COMMENT_BURST_WINDOW_SEC)

    if count <= SOCIAL_COMMENT_BURST_LIMIT:
        return

    await redis.delete(key)
    strike = (user.social_spam_strikes or 0) + 1
    duration = _mute_duration(strike)
    until = datetime.now(timezone.utc) + duration
    user.social_spam_strikes = strike
    user.social_muted_until = until

    await log_action(
        db,
        user_id=user.id,
        action="social_spam_muted",
        detail={
            "strike": strike,
            "duration_minutes": int(duration.total_seconds() // 60),
            "until": until.isoformat(),
            "reason": "comment_burst",
            "burst_count": int(count),
        },
        ip=ip,
    )
    await db.flush()
    raise HTTPException(
        status_code=429,
        detail={
            "error": {
                "code": "SOCIAL_SPAM_MUTED",
                "message": (
                    f"Demasiados comentarios seguidos. Silenciado "
                    f"{int(duration.total_seconds() // 60)} min."
                ),
                "retry_after": int(duration.total_seconds()),
                "until": until.isoformat(),
            }
        },
    )
