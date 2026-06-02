"""
IDOR tests — users must not access other users' bets, notifications, or private groups.
"""
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
from app.models.notification import Notification
from app.models.user import User
from tests.conftest import register_payload


async def _register_login(client: AsyncClient, username: str, password: str = "SecurePass1!"):
    await client.post("/api/v1/auth/register", json=register_payload(username, password=password))
    login = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert login.status_code == 200
    return login.cookies


async def _user_id(db: AsyncSession, username: str) -> uuid.UUID:
    row = await db.execute(select(User).where(User.username == username))
    return row.scalar_one().id


@pytest.mark.asyncio
async def test_cannot_get_another_users_bet(client: AsyncClient, db_session: AsyncSession):
    await _register_login(client, "idor_owner")
    victim_cookies = await _register_login(client, "idor_attacker")

    owner_id = await _user_id(db_session, "idor_owner")
    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="H",
        away_team="A",
        league_name="L",
        league_id=1,
        match_date=datetime.now(timezone.utc) + timedelta(days=1),
        status="scheduled",
        season=2026,
        betting_open=True,
    )
    db_session.add(fixture)
    bet = Bet(
        id=uuid.uuid4(),
        user_id=owner_id,
        fixture_id=fixture.id,
        predicted_home_score=1,
        predicted_away_score=0,
        amount=Decimal("0"),
        amount_confirmed=True,
    )
    db_session.add(bet)
    await db_session.flush()

    resp = await client.get(f"/api/v1/bets/{bet.id}", cookies=victim_cookies)
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_cannot_mark_another_users_notification_read(client: AsyncClient, db_session: AsyncSession):
    await _register_login(client, "idor_notif_owner")
    attacker_cookies = await _register_login(client, "idor_notif_attacker")

    owner_id = await _user_id(db_session, "idor_notif_owner")
    notif = Notification(
        id=uuid.uuid4(),
        user_id=owner_id,
        type="test",
        title="Private",
        body="Only owner",
    )
    db_session.add(notif)
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/notifications/{notif.id}/read",
        cookies=attacker_cookies,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_member_cannot_get_private_group(client: AsyncClient, db_session: AsyncSession):
    await _register_login(client, "idor_group_owner")
    outsider_cookies = await _register_login(client, "idor_group_outsider")

    owner_id = await _user_id(db_session, "idor_group_owner")
    group = Group(
        id=uuid.uuid4(),
        name="Private Polla",
        description=None,
        owner_id=owner_id,
        invite_code="secretcode12",
        max_members=10,
        entry_fee=Decimal("10"),
        prize_pool=Decimal("0"),
        currency="USD",
        bet_amount_mode="per_bet",
        fixed_bet_amount=Decimal("1"),
        is_active=False,
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner_id))
    await db_session.flush()

    resp = await client.get(f"/api/v1/groups/{group.id}", cookies=outsider_cookies)
    assert resp.status_code == 403
