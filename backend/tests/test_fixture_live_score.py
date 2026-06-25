"""Live fixture score, predictions board, privacy and projected points."""
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
from app.services.bet_service import calculate_points
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
    pw = "LiveFx1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    me = await client.get("/api/v1/users/me", cookies=resp.cookies)
    return resp.cookies, uuid.UUID(me.json()["id"])


async def _make_admin(db: AsyncSession, username: str) -> User:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    user.is_admin = True
    await db.flush()
    return user


async def _seed_polla(
    db: AsyncSession,
    owner_id: uuid.UUID,
    *,
    status: str = "scheduled",
    minutes_from_now: float = 48 * 60,
) -> tuple[Group, Fixture]:
    for g in (await db.execute(select(Group).where(Group.is_active == True))).scalars().all():  # noqa: E712
        g.is_active = False

    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Home FC",
        away_team="Away FC",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(minutes=minutes_from_now),
        status=status,
        home_score=0 if status != "scheduled" else None,
        away_score=0 if status != "scheduled" else None,
        round="R1",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=status != "scheduled",
        betting_open=status == "scheduled",
    )
    db.add(fixture)

    group = Group(
        id=uuid.uuid4(),
        name="Live Polla",
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
    db.add(GroupMember(group_id=group.id, user_id=owner_id, total_points=0))
    await db.flush()
    return group, fixture


async def _add_member(db: AsyncSession, group: Group, user_id: uuid.UUID) -> None:
    db.add(GroupMember(group_id=group.id, user_id=user_id, total_points=0))
    await db.flush()


async def _add_bet(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    group_id: uuid.UUID,
    fixture_id: uuid.UUID,
    home: int,
    away: int,
) -> Bet:
    bet = Bet(
        user_id=user_id,
        fixture_id=fixture_id,
        group_id=group_id,
        predicted_home_score=home,
        predicted_away_score=away,
        amount=Decimal("5"),
        amount_confirmed=True,
    )
    db.add(bet)
    await db.flush()
    return bet


@pytest.mark.asyncio
async def test_live_score_requires_admin(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "live_user1")
    group, fixture = await _seed_polla(db_session, user_id)
    fixture.status = "live"
    fixture.is_locked = True
    await db_session.flush()

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 1, "away_score": 0},
        cookies=cookies,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_live_score_only_when_live(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "live_admin2")
    await _make_admin(db_session, "live_admin2")
    group, fixture = await _seed_polla(db_session, user_id, status="scheduled")

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 1, "away_score": 0},
        cookies=cookies,
    )
    assert resp.status_code == 400
    body = resp.json()
    msg = str(body.get("detail", body)).lower()
    assert "not live" in msg


@pytest.mark.asyncio
async def test_start_live_blocked_before_kickoff(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "live_admin9")
    await _make_admin(db_session, "live_admin9")
    group, fixture = await _seed_polla(db_session, user_id, minutes_from_now=120)

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/status",
        json={"status": "live"},
        cookies=cookies,
    )
    assert resp.status_code == 400
    from tests.conftest import assert_api_error

    assert_api_error(resp, "FIXTURE_KICKOFF_NOT_REACHED", status=400)


@pytest.mark.asyncio
async def test_start_live_blocked_after_window(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "live_admin10")
    await _make_admin(db_session, "live_admin10")
    group, fixture = await _seed_polla(db_session, user_id, minutes_from_now=-150)

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/status",
        json={"status": "live"},
        cookies=cookies,
    )
    assert resp.status_code == 400
    from tests.conftest import assert_api_error

    assert_api_error(resp, "FIXTURE_LIVE_START_EXPIRED", status=400)


@pytest.mark.asyncio
async def test_live_score_updates_timeline_without_settling(
    client: AsyncClient, db_session: AsyncSession
):
    cookies, user_id = await _register(client, "live_admin3")
    await _make_admin(db_session, "live_admin3")
    group, fixture = await _seed_polla(db_session, user_id, minutes_from_now=-5)
    await _add_bet(db_session, user_id=user_id, group_id=group.id, fixture_id=fixture.id, home=2, away=1)

    start = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/status",
        json={"status": "live"},
        cookies=cookies,
    )
    assert start.status_code == 200

    score = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 1, "away_score": 0},
        cookies=cookies,
    )
    assert score.status_code == 200
    body = score.json()
    assert body["home_score"] == 1
    assert body["away_score"] == 0
    assert len(body["score_timeline"]) >= 2

    bet = (
        await db_session.execute(select(Bet).where(Bet.fixture_id == fixture.id))
    ).scalar_one()
    assert bet.points_earned is None


@pytest.mark.asyncio
async def test_predictions_board_blocked_when_scheduled(
    client: AsyncClient, db_session: AsyncSession
):
    cookies, user_id = await _register(client, "live_user4")
    group, fixture = await _seed_polla(db_session, user_id, status="scheduled")

    resp = await client.get(
        f"/api/v1/groups/{group.id}/fixtures/{fixture.id}/predictions-board",
        cookies=cookies,
    )
    from tests.conftest import assert_api_error

    assert_api_error(resp, "FIXTURE_NOT_LIVE", status=400)


@pytest.mark.asyncio
async def test_predictions_board_blurs_invite_only_for_other_viewer(
    client: AsyncClient, db_session: AsyncSession
):
    owner_cookies, owner_id = await _register(client, "live_owner5")
    viewer_cookies, viewer_id = await _register(client, "live_viewer5")
    group, fixture = await _seed_polla(db_session, owner_id)
    await _add_member(db_session, group, viewer_id)

    owner = (await db_session.execute(select(User).where(User.id == owner_id))).scalar_one()
    owner.bets_profile_visibility = "invite_only"
    fixture.status = "live"
    fixture.is_locked = True
    fixture.home_score = 0
    fixture.away_score = 0
    await db_session.flush()

    await _add_bet(db_session, user_id=owner_id, group_id=group.id, fixture_id=fixture.id, home=2, away=0)
    await _add_bet(db_session, user_id=viewer_id, group_id=group.id, fixture_id=fixture.id, home=1, away=1)

    resp = await client.get(
        f"/api/v1/groups/{group.id}/fixtures/{fixture.id}/predictions-board",
        cookies=viewer_cookies,
    )
    assert resp.status_code == 200
    entries = {e["user_id"]: e for e in resp.json()["entries"]}
    assert entries[str(owner_id)]["is_blurred"] is True
    assert entries[str(owner_id)]["username"] is None
    assert entries[str(owner_id)]["predicted_home_score"] is None
    assert entries[str(viewer_id)]["is_blurred"] is False

    own_resp = await client.get(
        f"/api/v1/groups/{group.id}/fixtures/{fixture.id}/predictions-board",
        cookies=owner_cookies,
    )
    own_entries = {e["user_id"]: e for e in own_resp.json()["entries"]}
    assert own_entries[str(owner_id)]["is_blurred"] is False
    assert own_entries[str(owner_id)]["predicted_home_score"] == 2


@pytest.mark.asyncio
async def test_predictions_board_projected_points_live(
    client: AsyncClient, db_session: AsyncSession
):
    cookies, user_id = await _register(client, "live_user6")
    group, fixture = await _seed_polla(db_session, user_id)
    fixture.status = "live"
    fixture.is_locked = True
    fixture.home_score = 2
    fixture.away_score = 1
    await db_session.flush()

    await _add_bet(db_session, user_id=user_id, group_id=group.id, fixture_id=fixture.id, home=2, away=1)
    await _add_bet(
        db_session,
        user_id=user_id,
        group_id=group.id,
        fixture_id=fixture.id,
        home=2,
        away=0,
    )

    resp = await client.get(
        f"/api/v1/groups/{group.id}/fixtures/{fixture.id}/predictions-board",
        cookies=cookies,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["home_score"] == 2
    assert body["away_score"] == 1

    by_pred = {
        (e["predicted_home_score"], e["predicted_away_score"]): e for e in body["entries"]
    }
    assert by_pred[(2, 1)]["projected_points"] == calculate_points(2, 1, 2, 1)
    assert by_pred[(2, 0)]["projected_points"] == calculate_points(2, 0, 2, 1)


@pytest.mark.asyncio
async def test_predictions_board_at_score_snapshot(
    client: AsyncClient, db_session: AsyncSession
):
    cookies, user_id = await _register(client, "live_user7")
    group, fixture = await _seed_polla(db_session, user_id)
    fixture.status = "live"
    fixture.is_locked = True
    fixture.home_score = 2
    fixture.away_score = 1
    await db_session.flush()

    await _add_bet(db_session, user_id=user_id, group_id=group.id, fixture_id=fixture.id, home=1, away=0)

    resp = await client.get(
        f"/api/v1/groups/{group.id}/fixtures/{fixture.id}/predictions-board",
        params={"at_home": 1, "at_away": 0},
        cookies=cookies,
    )
    assert resp.status_code == 200
    entry = resp.json()["entries"][0]
    assert entry["projected_points"] == calculate_points(1, 0, 1, 0)
    assert resp.json()["home_score"] == 1
    assert resp.json()["away_score"] == 0


@pytest.mark.asyncio
async def test_timeline_appends_on_score_change(client: AsyncClient, db_session: AsyncSession):
    cookies, user_id = await _register(client, "live_admin8")
    await _make_admin(db_session, "live_admin8")
    group, fixture = await _seed_polla(db_session, user_id, minutes_from_now=-5)

    await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/status",
        json={"status": "live"},
        cookies=cookies,
    )

    first = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 1, "away_score": 0},
        cookies=cookies,
    )
    tl_len_1 = len(first.json()["score_timeline"])

    second = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 2, "away_score": 0},
        cookies=cookies,
    )
    assert len(second.json()["score_timeline"]) == tl_len_1 + 1

    same = await client.patch(
        f"/api/v1/admin/fixtures/{fixture.id}/live-score",
        json={"home_score": 2, "away_score": 0},
        cookies=cookies,
    )
    assert len(same.json()["score_timeline"]) == len(second.json()["score_timeline"])
