"""Unpaid extras are cancelled when fixture betting closes."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.bet_service import bet_eligible_for_scoring, settle_fixture_bets
from app.services.betting_close_service import close_fixture_betting
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _noop_notifications(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.admin.notify_all_active_users", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_fixture_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_polla_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop)
    monkeypatch.setattr("app.services.notification_service.resolve_actionable_notifications", _noop)
    monkeypatch.setattr("app.services.badge_notify_service.notify_new_badges_for_fixture", _noop)


async def _register(client: AsyncClient, username: str) -> tuple:
    pw = "CancelExtra1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    me = await client.get("/api/v1/users/me", cookies=resp.cookies)
    return resp.cookies, uuid.UUID(me.json()["id"])


async def _make_admin(db: AsyncSession, username: str) -> User:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    user.is_admin = True
    await db.flush()
    return user


async def _seed_polla(db: AsyncSession, user_id: uuid.UUID) -> tuple[Group, Fixture]:
    for g in (await db.execute(select(Group).where(Group.is_active == True))).scalars().all():  # noqa: E712
        g.is_active = False

    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Cancel Home",
        away_team="Cancel Away",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(seconds=30),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=False,
        betting_open=True,
    )
    db.add(fixture)

    group = Group(
        id=uuid.uuid4(),
        name="Cancel Polla",
        description=None,
        owner_id=user_id,
        invite_code=uuid.uuid4().hex[:12],
        max_members=50,
        entry_fee=Decimal("10"),
        prize_pool=Decimal("0"),
        currency="USD",
        bet_amount_mode="single_entry",
        fixed_bet_amount=Decimal("5"),
        is_active=True,
    )
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user_id, total_points=0))
    await db.flush()
    return group, fixture


@pytest.mark.asyncio
async def test_close_betting_cancels_unpaid_extra_and_logs(
    client: AsyncClient, db_session: AsyncSession
):
    cookies, user_id = await _register(client, "cancel_user1")
    admin_cookies, _ = await _register(client, "cancel_admin1")
    await _make_admin(db_session, "cancel_admin1")
    group, fixture = await _seed_polla(db_session, user_id)

    extra_bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=group.id,
        predicted_home_score=2,
        predicted_away_score=1,
        amount=Decimal("5"),
        amount_confirmed=False,
    )
    db_session.add(extra_bet)
    await db_session.commit()

    await close_fixture_betting(db_session, fixture, reason="lock_window")
    await db_session.commit()

    await db_session.refresh(extra_bet)
    await db_session.refresh(fixture)
    assert extra_bet.cancelled_at is not None
    assert extra_bet.amount_confirmed is False
    assert fixture.is_locked is True
    assert fixture.betting_open is False

    audit = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "extra_bet_cancelled_unpaid")
        )
    ).scalars().all()
    assert len(audit) == 1
    detail = json.loads(audit[0].detail or "{}")
    assert detail["username"] == "cancel_user1"
    assert detail["amount"] in ("5.00", "5")

    my_bets = await client.get("/api/v1/bets/my-bets", cookies=cookies)
    assert my_bets.status_code == 200
    row = next((b for b in my_bets.json()["data"] if b["id"] == str(extra_bet.id)), None)
    assert row is not None
    assert row["cancelled_at"] is not None

    pending = await client.get(
        f"/api/v1/admin/groups/{group.id}/pending-extras",
        cookies=admin_cookies,
    )
    assert pending.status_code == 200
    assert pending.json() == []

    confirm = await client.post(
        f"/api/v1/admin/groups/{group.id}/confirm-extra/{extra_bet.id}",
        cookies=admin_cookies,
    )
    assert confirm.status_code == 409


@pytest.mark.asyncio
async def test_cancelled_extra_not_scored_on_settle(db_session: AsyncSession):
    user_id = uuid.uuid4()
    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=99,
        home_team="H",
        away_team="A",
        home_logo_url=None,
        away_logo_url=None,
        league_name="T",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc),
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
    db_session.add(fixture)
    bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=uuid.uuid4(),
        predicted_home_score=1,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
        cancelled_at=datetime.now(timezone.utc),
    )
    db_session.add(bet)
    await db_session.commit()

    assert bet_eligible_for_scoring(bet) is False
    result = await settle_fixture_bets(db_session, fixture)
    await db_session.commit()
    await db_session.refresh(bet)
    assert result.settled_count == 0
    assert bet.points_earned is None
