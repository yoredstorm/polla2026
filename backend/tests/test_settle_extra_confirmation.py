"""Settlement must ignore unpaid extras; retroactive settle on confirm."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.bet_service import settle_fixture_bets, settle_single_bet, bet_eligible_for_scoring
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
    monkeypatch.setattr("app.api.v1.admin.create_notification", _noop)
    monkeypatch.setattr("app.services.badge_notify_service.notify_new_badges_for_fixture", _noop)


async def _register(client: AsyncClient, username: str) -> tuple:
    pw = "SettleExtra1!"
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
        home_team="Home",
        away_team="Away",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(hours=48),
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
        name="Settle Polla",
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
async def test_unpaid_extra_skipped_on_settle(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "settle_user1")
    group, fixture = await _seed_polla(db_session, user_id)

    free_bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=None,
        predicted_home_score=2,
        predicted_away_score=1,
        amount=Decimal("0"),
        amount_confirmed=True,
    )
    extra_bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=group.id,
        predicted_home_score=2,
        predicted_away_score=1,
        amount=Decimal("5"),
        amount_confirmed=False,
    )
    db_session.add_all([free_bet, extra_bet])
    await db_session.commit()

    fixture.status = "finished"
    fixture.home_score = 2
    fixture.away_score = 1
    await db_session.commit()

    result = await settle_fixture_bets(db_session, fixture)
    await db_session.commit()

    assert result.settled_count == 1
    assert result.skipped_unconfirmed_extras == 1

    await db_session.refresh(free_bet)
    await db_session.refresh(extra_bet)
    assert free_bet.points_earned == 2
    assert extra_bet.points_earned is None

    member = (
        await db_session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group.id, GroupMember.user_id == user_id
            )
        )
    ).scalar_one()
    assert member.total_points == 2


@pytest.mark.asyncio
async def test_confirm_extra_before_kickoff_then_settle(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "settle_user2")
    admin_cookies, _ = await _register(client, "settle_admin")
    await _make_admin(db_session, "settle_admin")
    group, fixture = await _seed_polla(db_session, user_id)

    extra_bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=group.id,
        predicted_home_score=1,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
    )
    db_session.add(extra_bet)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admin/groups/{group.id}/confirm-extra/{extra_bet.id}",
        cookies=admin_cookies,
    )
    assert resp.status_code == 200

    fixture.status = "finished"
    fixture.home_score = 1
    fixture.away_score = 0
    await db_session.commit()

    await settle_fixture_bets(db_session, fixture)
    await db_session.commit()

    await db_session.refresh(extra_bet)
    member = (
        await db_session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group.id, GroupMember.user_id == user_id
            )
        )
    ).scalar_one()
    assert extra_bet.points_earned == 2
    assert member.total_points == 2


@pytest.mark.asyncio
async def test_confirm_extra_after_kickoff_rejected(client: AsyncClient, db_session: AsyncSession):
    admin_cookies, _ = await _register(client, "settle_admin3")
    cookies, user_id = await _register(client, "settle_user3b")
    await _make_admin(db_session, "settle_admin3")
    group, fixture = await _seed_polla(db_session, user_id)

    extra_bet = Bet(
        user_id=user_id,
        fixture_id=fixture.id,
        group_id=group.id,
        predicted_home_score=1,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
    )
    db_session.add(extra_bet)
    fixture.is_locked = True
    fixture.betting_open = False
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/admin/groups/{group.id}/confirm-extra/{extra_bet.id}",
        cookies=admin_cookies,
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_admin_settle_response_includes_skipped(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "settle_user3")
    admin_cookies, _ = await _register(client, "settle_admin2")
    await _make_admin(db_session, "settle_admin2")
    group, fixture = await _seed_polla(db_session, user_id)

    db_session.add(
        Bet(
            user_id=user_id,
            fixture_id=fixture.id,
            group_id=group.id,
            predicted_home_score=1,
            predicted_away_score=0,
            amount=Decimal("5"),
            amount_confirmed=False,
        )
    )
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/result",
        json={"home_score": 1, "away_score": 0, "status": "finished"},
        cookies=admin_cookies,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["skipped_unconfirmed_extras"] == 1
    assert body["settled_count"] == 0


@pytest.mark.asyncio
async def test_bet_eligible_for_scoring_helper():
    free = Bet(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        fixture_id=uuid.uuid4(),
        predicted_home_score=0,
        predicted_away_score=0,
        amount=Decimal("0"),
        amount_confirmed=False,
    )
    unpaid = Bet(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        fixture_id=uuid.uuid4(),
        predicted_home_score=0,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
    )
    paid = Bet(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        fixture_id=uuid.uuid4(),
        predicted_home_score=0,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=True,
    )
    cancelled = Bet(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        fixture_id=uuid.uuid4(),
        predicted_home_score=0,
        predicted_away_score=0,
        amount=Decimal("5"),
        amount_confirmed=False,
        cancelled_at=datetime.now(timezone.utc),
    )
    assert bet_eligible_for_scoring(free) is True
    assert bet_eligible_for_scoring(unpaid) is False
    assert bet_eligible_for_scoring(paid) is True
    assert bet_eligible_for_scoring(cancelled) is False
