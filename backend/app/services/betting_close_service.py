"""Close fixture betting at lock time and persist a trends snapshot in audit_logs."""
import uuid
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.fixture import Fixture
from app.services.audit import log_action
from app.core.match_timing import BETTING_CLOSE_BEFORE, betting_close_at, should_lock_fixture
from app.services.betting_trends_service import get_fixture_betting_trends
from app.services.bet_service import cancel_unpaid_extras_for_fixture
import structlog

logger = structlog.get_logger(__name__)

BETTING_SOON_WARN_MINUTES = 15


async def _snapshot_already_logged(db: AsyncSession, fixture_id: uuid.UUID) -> bool:
    fid = str(fixture_id)
    res = await db.execute(
        select(AuditLog.id)
        .where(
            AuditLog.action == "fixture_betting_closed_snapshot",
            AuditLog.detail.contains(fid),
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def close_fixture_betting(
    db: AsyncSession,
    fixture: Fixture,
    *,
    reason: str = "lock_window",
    redis: aioredis.Redis | None = None,
) -> bool:
    """
    Set is_locked + betting_open=false and log one trends snapshot.
    Returns True if betting was open and got closed now.
    """
    was_open = fixture.betting_open and fixture.status == "scheduled"
    if not was_open and fixture.is_locked:
        await cancel_unpaid_extras_for_fixture(db, fixture, reason=reason)
        return False

    trends = await get_fixture_betting_trends(db, fixture.id)
    if not await _snapshot_already_logged(db, fixture.id) and trends:
        home_pct = draw_pct = away_pct = 0.0
        for o in trends.get("outcomes") or []:
            if o["key"] == "home_win":
                home_pct = o["pct"]
            elif o["key"] == "draw":
                draw_pct = o["pct"]
            elif o["key"] == "away_win":
                away_pct = o["pct"]
        await log_action(
            db,
            user_id=None,
            action="fixture_betting_closed_snapshot",
            detail={
                "fixture_id": str(fixture.id),
                "reason": reason,
                "total_bets": trends.get("total_bets", 0),
                "home_pct": home_pct,
                "draw_pct": draw_pct,
                "away_pct": away_pct,
                "snapshot": trends,
            },
            ip=None,
        )

    fixture.is_locked = True
    fixture.betting_open = False
    await db.flush()
    await cancel_unpaid_extras_for_fixture(db, fixture, reason=reason)
    logger.info(
        "fixture_betting_closed",
        fixture_id=str(fixture.id),
        reason=reason,
        total_bets=trends.get("total_bets") if trends else 0,
    )
    if was_open:
        from app.services.notification_service import notify_fixture_betting_closed

        await notify_fixture_betting_closed(db, redis, fixture, reason=reason)
    return was_open


async def open_fixture_betting(
    db: AsyncSession,
    fixture: Fixture,
) -> bool:
    """Re-open betting for a scheduled fixture still outside the lock window."""
    if fixture.status != "scheduled":
        return False
    if should_lock_fixture(fixture):
        return False
    fixture.is_locked = False
    fixture.betting_open = True
    await db.flush()
    return True


async def close_fixture_betting_if_due(
    db: AsyncSession,
    fixture: Fixture,
    *,
    redis: aioredis.Redis | None = None,
) -> bool:
    """Close when within 1 minute of kickoff (same rule as should_lock_fixture)."""
    if fixture.status != "scheduled":
        return False
    if not should_lock_fixture(fixture):
        return False
    if fixture.is_locked and not fixture.betting_open:
        await cancel_unpaid_extras_for_fixture(db, fixture, reason="lock_window")
        return False
    return await close_fixture_betting(db, fixture, reason="lock_window", redis=redis)


async def _soon_warn_already_logged(db: AsyncSession, fixture_id: uuid.UUID) -> bool:
    fid = str(fixture_id)
    res = await db.execute(
        select(AuditLog.id)
        .where(
            AuditLog.action == "fixture_betting_soon_warned",
            AuditLog.detail.contains(fid),
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def warn_fixtures_betting_closing_soon(
    db: AsyncSession,
    redis: aioredis.Redis | None,
) -> int:
    """Notify admins once per fixture ~15 minutes before betting closes."""
    from app.services.notification_service import (
        build_fixture_betting_soon_admin,
        notify_admins,
    )

    now = datetime.now(timezone.utc)
    warned = 0
    res = await db.execute(
        select(Fixture).where(
            Fixture.status == "scheduled",
            Fixture.betting_open == True,  # noqa: E712
            Fixture.match_date > now,
        )
    )
    for fixture in res.scalars().all():
        close_at = betting_close_at(fixture)
        seconds_left = (close_at - now).total_seconds()
        minutes_left = int(seconds_left // 60)
        if minutes_left < BETTING_SOON_WARN_MINUTES - 1 or minutes_left > BETTING_SOON_WARN_MINUTES + 1:
            continue
        if await _soon_warn_already_logged(db, fixture.id):
            continue
        await log_action(
            db,
            user_id=None,
            action="fixture_betting_soon_warned",
            detail={"fixture_id": str(fixture.id), "minutes_left": minutes_left},
            ip=None,
        )
        nt, nb, np = build_fixture_betting_soon_admin(
            fixture_id=str(fixture.id),
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            minutes_left=minutes_left,
        )
        await notify_admins(
            db, redis, type="fixture_betting_soon_admin", title=nt, body=nb, payload=np,
        )
        warned += 1
    return warned


async def close_due_fixtures_batch(
    db: AsyncSession,
    redis: aioredis.Redis | None = None,
) -> int:
    """Scan scheduled fixtures that should lock; used by background job."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(Fixture).where(
            Fixture.status == "scheduled",
            Fixture.betting_open == True,  # noqa: E712
            Fixture.match_date <= now + BETTING_CLOSE_BEFORE,
        )
    )
    closed = 0
    for fixture in res.scalars().all():
        if should_lock_fixture(fixture):
            if await close_fixture_betting_if_due(db, fixture, redis=redis):
                closed += 1
    return closed
