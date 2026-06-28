"""Admin settle must not 500 when closing the last fixture of a phase."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.phase_winner import PhaseWinnerHistory
from app.models.user import User
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _noop_side_effects(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.v1.admin.notify_all_active_users", _noop)
    monkeypatch.setattr("app.api.v1.admin.broadcast_fixture_updated", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop)
    monkeypatch.setattr("app.api.v1.admin.create_notification", _noop)
    monkeypatch.setattr("app.services.badge_notify_service.notify_new_badges_for_fixture", _noop)
    monkeypatch.setattr(
        "app.services.phase_enrollment_service.notify_members_needing_phase_enrollment",
        _noop,
    )


async def _register(client: AsyncClient, username: str) -> tuple:
    pw = "PhaseClose1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    me = await client.get("/api/v1/users/me", cookies=resp.cookies)
    return resp.cookies, uuid.UUID(me.json()["id"])


async def _make_admin(db: AsyncSession, username: str) -> None:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    user.is_admin = True
    await db.flush()


async def test_admin_settle_closes_phase_without_500(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, owner_id = await _register(client, "phase_close_owner")
    admin_cookies, _ = await _register(client, "phase_close_admin")
    await _make_admin(db_session, "phase_close_admin")

    for g in (await db_session.execute(select(Group).where(Group.is_active == True))).scalars().all():  # noqa: E712
        g.is_active = False

    group = Group(
        name="Phase Close Polla",
        owner_id=owner_id,
        invite_code="phaseclose01",
        entry_fee=Decimal("10"),
        prize_pool=Decimal("40"),
        is_active=True,
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner_id, total_points=12))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner_id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )

    finished = Fixture(
        external_id=9001,
        home_team="A",
        away_team="B",
        league_name="WC",
        league_id=1,
        match_date=datetime(2026, 6, 11, tzinfo=timezone.utc),
        status="finished",
        home_score=1,
        away_score=0,
        season=2026,
        group_name="Group A",
    )
    pending = Fixture(
        external_id=9002,
        home_team="C",
        away_team="D",
        league_name="WC",
        league_id=1,
        match_date=datetime(2026, 6, 12, tzinfo=timezone.utc),
        status="scheduled",
        season=2026,
        group_name="Group B",
    )
    db_session.add_all([finished, pending])
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/admin/fixtures/{pending.id}/result",
        json={"home_score": 2, "away_score": 1, "status": "finished"},
        cookies=admin_cookies,
    )
    assert resp.status_code == 200, resp.text

    history = (
        await db_session.execute(
            select(PhaseWinnerHistory).where(
                PhaseWinnerHistory.group_id == group.id,
                PhaseWinnerHistory.phase_key == "groups",
            )
        )
    ).scalar_one_or_none()
    assert history is not None
    assert history.winner_user_id == owner_id
    await db_session.refresh(group)
    assert group.current_phase_key == "knockout"
    assert group.prize_pool == Decimal("0.00")
