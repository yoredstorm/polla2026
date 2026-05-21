"""Inbox notifications: follow, following bet, admin confirms, read filter."""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.social import UserFollow
from app.models.user import User
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


class _FakeRedis:
    async def publish(self, *_args, **_kwargs):
        return 0


@pytest.fixture(autouse=True)
def _mock_redis(monkeypatch):
    fake = _FakeRedis()

    async def _get_redis():
        return fake

    async def _noop_publish(*_args, **_kwargs):
        pass

    import app.db.session as db_session_mod

    db_session_mod._redis_client = None
    monkeypatch.setattr(db_session_mod, "get_redis", _get_redis)
    monkeypatch.setattr("app.api.deps.get_redis", _get_redis)
    monkeypatch.setattr("app.services.notification_service.publish_to_user", _noop_publish)
    monkeypatch.setattr("app.api.v1.notifications.publish_to_user", _noop_publish)


@pytest.fixture(autouse=True)
def _noop_broadcasts(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    async def _noop_list(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop_list)
    monkeypatch.setattr("app.api.v1.admin.broadcast_polla_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_fixture_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop_list)
    monkeypatch.setattr("app.api.v1.bets.notify_admins", _noop_list)


async def _register(client: AsyncClient, username: str) -> tuple:
    pw = "InboxNotif1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    login = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    me = await client.get("/api/v1/users/me", cookies=login.cookies)
    return login.cookies, uuid.UUID(me.json()["id"])


async def _make_admin(db: AsyncSession, username: str) -> User:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    user.is_admin = True
    await db.flush()
    return user


async def _seed_polla(db: AsyncSession, owner_id: uuid.UUID) -> tuple[Group, Fixture]:
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
        name="Inbox Polla",
        description=None,
        owner_id=owner_id,
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
    return group, fixture


async def _fetch_notifications(client: AsyncClient, cookies, **params):
    return await client.get("/api/v1/notifications", cookies=cookies, params=params)


async def test_follow_creates_notification_for_followed(client: AsyncClient):
    await _register(client, "followed_user")
    follower_cookies, _ = await _register(client, "follower_user")

    resp = await client.post("/api/v1/social/follow/followed_user", cookies=follower_cookies)
    assert resp.status_code == 201

    followed_login = await client.post(
        "/api/v1/auth/login",
        json={"username": "followed_user", "password": "InboxNotif1!"},
    )
    notifs = await _fetch_notifications(client, followed_login.cookies, filter="unread")
    assert notifs.status_code == 200
    types = [n["type"] for n in notifs.json()["data"]]
    assert "social_follow" in types


async def test_bet_notifies_follower(client: AsyncClient, db_session: AsyncSession):
    bettor_cookies, bettor_id = await _register(client, "bettor_inbox")
    follower_cookies, follower_id = await _register(client, "follower_inbox")

    db_session.add(UserFollow(follower_id=follower_id, following_id=bettor_id))
    await db_session.flush()

    group, fixture = await _seed_polla(db_session, bettor_id)
    db_session.add(GroupMember(group_id=group.id, user_id=bettor_id, total_points=0))
    await db_session.flush()

    bet_resp = await client.post(
        "/api/v1/bets",
        json={
            "fixture_id": str(fixture.id),
            "predicted_home_score": 1,
            "predicted_away_score": 0,
            "group_id": None,
            "amount": "0",
        },
        cookies=bettor_cookies,
    )
    assert bet_resp.status_code == 201

    notifs = await _fetch_notifications(client, follower_cookies, filter="unread")
    assert notifs.status_code == 200
    assert any(n["type"] == "following_bet" for n in notifs.json()["data"])


async def test_confirm_entry_notifies_member(client: AsyncClient, db_session: AsyncSession):
    admin_cookies, admin_id = await _register(client, "entry_admin")
    member_cookies, member_id = await _register(client, "entry_member")
    await _make_admin(db_session, "entry_admin")

    group, _ = await _seed_polla(db_session, admin_id)

    add_resp = await client.post(
        f"/api/v1/admin/groups/{group.id}/members",
        json={"user_id": str(member_id)},
        cookies=admin_cookies,
    )
    assert add_resp.status_code == 201

    notifs = await _fetch_notifications(client, member_cookies, filter="unread")
    assert notifs.status_code == 200
    assert any(n["type"] == "entry_confirmed" for n in notifs.json()["data"])


async def test_confirm_extra_notifies_bet_owner(client: AsyncClient, db_session: AsyncSession):
    admin_cookies, admin_id = await _register(client, "extra_admin")
    member_cookies, member_id = await _register(client, "extra_member")
    await _make_admin(db_session, "extra_admin")

    group, fixture = await _seed_polla(db_session, admin_id)
    db_session.add(GroupMember(group_id=group.id, user_id=member_id, total_points=0))
    await db_session.flush()

    bet_resp = await client.post(
        "/api/v1/bets",
        json={
            "fixture_id": str(fixture.id),
            "predicted_home_score": 2,
            "predicted_away_score": 1,
            "group_id": str(group.id),
            "amount": str(group.fixed_bet_amount),
        },
        cookies=member_cookies,
    )
    assert bet_resp.status_code == 201
    bet_id = bet_resp.json()["id"]

    confirm = await client.post(
        f"/api/v1/admin/groups/{group.id}/confirm-extra/{bet_id}",
        cookies=admin_cookies,
    )
    assert confirm.status_code == 200

    notifs = await _fetch_notifications(client, member_cookies, filter="unread")
    assert notifs.status_code == 200
    assert any(n["type"] == "extra_confirmed" for n in notifs.json()["data"])


async def test_filter_read_returns_only_read_notifications(client: AsyncClient):
    await _register(client, "filter_read_target")
    follower_cookies, _ = await _register(client, "filter_read_follower")
    await client.post("/api/v1/social/follow/filter_read_target", cookies=follower_cookies)

    target_login = await client.post(
        "/api/v1/auth/login",
        json={"username": "filter_read_target", "password": "InboxNotif1!"},
    )
    cookies = target_login.cookies

    notifs = await _fetch_notifications(client, cookies, filter="unread")
    assert notifs.status_code == 200
    items = notifs.json()["data"]
    assert len(items) >= 1

    nid = items[0]["id"]
    mark = await client.patch(f"/api/v1/notifications/{nid}/read", cookies=cookies)
    assert mark.status_code == 200

    read_only = await _fetch_notifications(client, cookies, filter="read")
    assert read_only.status_code == 200
    read_ids = {n["id"] for n in read_only.json()["data"]}
    assert nid in read_ids
    assert all(n["read_at"] is not None for n in read_only.json()["data"])

    unread_only = await _fetch_notifications(client, cookies, filter="unread")
    unread_ids = {n["id"] for n in unread_only.json()["data"]}
    assert nid not in unread_ids
