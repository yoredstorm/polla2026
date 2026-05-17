"""Close fixture betting at lock time and persist a trends snapshot in audit_logs."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.fixture import Fixture
from app.services.audit import log_action
from app.services.bet_service import should_lock_fixture
from app.services.betting_trends_service import get_fixture_betting_trends
import structlog

logger = structlog.get_logger(__name__)


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
) -> bool:
    """
    Set is_locked + betting_open=false and log one trends snapshot.
    Returns True if betting was open and got closed now.
    """
    was_open = fixture.betting_open and fixture.status == "scheduled"
    if not was_open and fixture.is_locked:
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
    logger.info(
        "fixture_betting_closed",
        fixture_id=str(fixture.id),
        reason=reason,
        total_bets=trends.get("total_bets") if trends else 0,
    )
    return was_open


async def close_fixture_betting_if_due(db: AsyncSession, fixture: Fixture) -> bool:
    """Close when within 1h of kickoff (same rule as should_lock_fixture)."""
    if fixture.status != "scheduled":
        return False
    if not should_lock_fixture(fixture):
        return False
    if fixture.is_locked and not fixture.betting_open:
        return False
    return await close_fixture_betting(db, fixture, reason="lock_window")


async def close_due_fixtures_batch(db: AsyncSession) -> int:
    """Scan scheduled fixtures that should lock; used by background job."""
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(Fixture).where(
            Fixture.status == "scheduled",
            Fixture.betting_open == True,  # noqa: E712
            Fixture.match_date <= now + timedelta(hours=1),
        )
    )
    closed = 0
    for fixture in res.scalars().all():
        if should_lock_fixture(fixture):
            if await close_fixture_betting_if_due(db, fixture):
                closed += 1
    return closed
