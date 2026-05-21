"""Repair cancels extras on closed fixtures and backfills audit logs."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.core.security import hash_password
from app.services.bet_service import repair_unpaid_extra_cancellations

pytestmark = pytest.mark.asyncio


@pytest.mark.asyncio
async def test_repair_backfills_audit_for_already_cancelled_bet(db_session: AsyncSession):
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        username="repair_cancel_user",
        email=None,
        hashed_password=hash_password("Test1234!"),
        is_active=True,
        is_admin=False,
    )
    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=77,
        home_team="H",
        away_team="A",
        home_logo_url=None,
        away_logo_url=None,
        league_name="T",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) - timedelta(hours=2),
        status="finished",
        home_score=1,
        away_score=0,
        round="R",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=True,
        betting_open=False,
    )
    group = Group(
        id=uuid.uuid4(),
        name="Repair G",
        description=None,
        owner_id=user_id,
        invite_code="repair123",
        max_members=10,
        entry_fee=Decimal("10"),
        prize_pool=Decimal("0"),
        currency="USD",
        bet_amount_mode="single_entry",
        fixed_bet_amount=Decimal("5"),
        is_active=True,
    )
    db_session.add_all([user, fixture, group])
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=user_id, total_points=0))
    bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=group.id,
        predicted_home_score=1,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
        cancelled_at=datetime.now(timezone.utc),
    )
    db_session.add(bet)
    await db_session.commit()

    result = await repair_unpaid_extra_cancellations(db_session)
    await db_session.commit()

    assert result["audit_backfilled"] >= 1
    audit = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "extra_bet_cancelled_unpaid")
        )
    ).scalars().all()
    assert len(audit) >= 1
    bet_ids = {json.loads(a.detail or "{}").get("bet_id") for a in audit}
    assert str(bet.id) in bet_ids
