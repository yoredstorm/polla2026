"""Rate limits for fixture team cheer (confetti support)."""
import uuid

from fastapi import HTTPException
import redis.asyncio as aioredis

CHEER_COOLDOWN_SEC = 2
CHEER_BURST_LIMIT = 20
CHEER_BURST_WINDOW_SEC = 120
CHEER_STRIKE_TTL_SEC = 86400
MUTE_MINUTES_BY_STRIKE = [5, 10, 30]


def _mute_seconds(strike: int) -> int:
    idx = min(max(strike, 1), len(MUTE_MINUTES_BY_STRIKE)) - 1
    return MUTE_MINUTES_BY_STRIKE[idx] * 60


def _base_key(user_id: uuid.UUID, fixture_id: uuid.UUID) -> str:
    return f"{user_id}:{fixture_id}"


async def record_fixture_cheer(
    redis: aioredis.Redis | None,
    user_id: uuid.UUID,
    fixture_id: uuid.UUID,
) -> None:
    """Enforce per-user per-fixture cheer limits. Raises HTTP 429 when blocked."""
    if not redis:
        return

    base = _base_key(user_id, fixture_id)
    mute_key = f"cheer:mute:{base}"

    mute_ttl = await redis.ttl(mute_key)
    if mute_ttl is not None and mute_ttl > 0:
        minutes = max(1, (mute_ttl + 59) // 60)
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "CHEER_MUTED",
                    "message": (
                        f"Demasiados apoyos seguidos. Podras apoyar de nuevo en {minutes} min."
                    ),
                    "retry_after": mute_ttl,
                }
            },
        )

    cooldown_key = f"cheer:cooldown:{base}"
    acquired = await redis.set(cooldown_key, "1", nx=True, ex=CHEER_COOLDOWN_SEC)
    if not acquired:
        retry = await redis.ttl(cooldown_key)
        retry_after = max(1, retry if retry and retry > 0 else CHEER_COOLDOWN_SEC)
        raise HTTPException(
            status_code=429,
            detail={
                "error": {
                    "code": "CHEER_COOLDOWN",
                    "message": "Espera un momento antes de apoyar de nuevo.",
                    "retry_after": retry_after,
                }
            },
        )

    burst_key = f"cheer:burst:{base}"
    count = await redis.incr(burst_key)
    if count == 1:
        await redis.expire(burst_key, CHEER_BURST_WINDOW_SEC)

    if count <= CHEER_BURST_LIMIT:
        return

    await redis.delete(burst_key)
    strike_key = f"cheer:strike:{base}"
    strike = await redis.incr(strike_key)
    if strike == 1:
        await redis.expire(strike_key, CHEER_STRIKE_TTL_SEC)

    mute_sec = _mute_seconds(int(strike))
    await redis.set(mute_key, "1", ex=mute_sec)
    minutes = mute_sec // 60
    raise HTTPException(
        status_code=429,
        detail={
            "error": {
                "code": "CHEER_MUTED",
                "message": (
                    f"Demasiados apoyos seguidos. Podras apoyar de nuevo en {minutes} min."
                ),
                "retry_after": mute_sec,
            }
        },
    )
