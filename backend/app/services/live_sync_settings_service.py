"""Global live sync settings (singleton row)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live_sync import LiveSyncSettings

CACHE_KEY = "live_sync_settings:v1"
CACHE_TTL_SECONDS = 10

DEFAULTS = {
    "poll_interval_seconds": 5,
    "pre_kickoff_minutes": 10,
    "max_concurrent_polls": 3,
    "failure_threshold": 6,
    "confirm_reads_required": 2,
    "sync_enabled_globally": True,
}


def settings_to_dict(row: LiveSyncSettings) -> dict:
    return {
        "poll_interval_seconds": row.poll_interval_seconds,
        "pre_kickoff_minutes": row.pre_kickoff_minutes,
        "max_concurrent_polls": row.max_concurrent_polls,
        "failure_threshold": row.failure_threshold,
        "confirm_reads_required": row.confirm_reads_required,
        "sync_enabled_globally": row.sync_enabled_globally,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def get_live_sync_settings(db: AsyncSession, redis: aioredis.Redis | None = None) -> LiveSyncSettings:
    if redis is not None:
        cached = await redis.get(CACHE_KEY)
        if cached:
            data = json.loads(cached)
            row = LiveSyncSettings(id=1)
            for k, v in data.items():
                if k == "updated_at":
                    continue
                setattr(row, k, v)
            if data.get("updated_at"):
                row.updated_at = datetime.fromisoformat(data["updated_at"])
            return row

    res = await db.execute(select(LiveSyncSettings).where(LiveSyncSettings.id == 1))
    row = res.scalar_one_or_none()
    if row is None:
        row = LiveSyncSettings(id=1, **DEFAULTS)
        db.add(row)
        await db.flush()

    if redis is not None:
        await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, json.dumps(settings_to_dict(row), default=str))

    return row


async def invalidate_settings_cache(redis: aioredis.Redis | None) -> None:
    if redis is not None:
        await redis.delete(CACHE_KEY)


async def update_live_sync_settings(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    poll_interval_seconds: int | None = None,
    pre_kickoff_minutes: int | None = None,
    max_concurrent_polls: int | None = None,
    failure_threshold: int | None = None,
    confirm_reads_required: int | None = None,
    sync_enabled_globally: bool | None = None,
) -> LiveSyncSettings:
    row = await get_live_sync_settings(db, redis=None)

    if poll_interval_seconds is not None:
        row.poll_interval_seconds = max(5, min(120, poll_interval_seconds))
    if pre_kickoff_minutes is not None:
        row.pre_kickoff_minutes = max(5, min(60, pre_kickoff_minutes))
    if max_concurrent_polls is not None:
        row.max_concurrent_polls = max(1, min(10, max_concurrent_polls))
    if failure_threshold is not None:
        row.failure_threshold = max(3, min(20, failure_threshold))
    if confirm_reads_required is not None:
        row.confirm_reads_required = max(1, min(5, confirm_reads_required))
    if sync_enabled_globally is not None:
        row.sync_enabled_globally = sync_enabled_globally

    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await invalidate_settings_cache(redis)
    return row
