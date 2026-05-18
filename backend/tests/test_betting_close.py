"""Tests for automatic betting close + audit snapshot."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.fixture import Fixture
from app.services.bet_service import should_lock_fixture
from app.services.betting_close_service import close_fixture_betting_if_due


def _fixture(hours_from_now: float = 0.5) -> Fixture:
    return Fixture(
        id=uuid.uuid4(),
        external_id=999001,
        home_team="A",
        away_team="B",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(hours=hours_from_now),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="G",
        venue=None,
        season=2026,
        is_locked=False,
        betting_open=True,
    )


@pytest.mark.asyncio
async def test_should_lock_within_one_minute():
    f = _fixture(hours_from_now=0.5 / 60)
    assert should_lock_fixture(f) is True


@pytest.mark.asyncio
async def test_should_not_lock_two_minutes_before():
    f = _fixture(hours_from_now=2 / 60)
    assert should_lock_fixture(f) is False


@pytest.mark.asyncio
async def test_close_fixture_betting_logs_snapshot(db_session):
    f = _fixture(hours_from_now=0.5 / 60)
    db_session.add(f)
    await db_session.flush()

    closed = await close_fixture_betting_if_due(db_session, f)
    assert closed is True
    assert f.is_locked is True
    assert f.betting_open is False

    res = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "fixture_betting_closed_snapshot")
    )
    logs = res.scalars().all()
    assert len(logs) >= 1
    assert str(f.id) in (logs[0].detail or "")
