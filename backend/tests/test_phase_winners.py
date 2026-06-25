"""Tests for tournament phase winners and auto-close."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.phase_winner import PhaseWinnerHistory
from app.models.user import User
from app.services.tournament_phase_service import (
    PHASE_ORDER,
    close_phase,
    count_phase_fixtures,
    fixture_phase_key,
    is_phase_complete,
    try_close_completed_phases,
    build_tournament_progress,
)


def _fixture(
    external_id: int,
    *,
    group_name: str | None = None,
    round_name: str | None = None,
    status: str = "scheduled",
) -> Fixture:
    return Fixture(
        external_id=external_id,
        home_team="A",
        away_team="B",
        league_name="WC",
        league_id=1,
        match_date=datetime(2026, 6, 11, tzinfo=timezone.utc),
        status=status,
        season=2026,
        round=round_name,
        group_name=group_name,
        home_score=1 if status == "finished" else None,
        away_score=0 if status == "finished" else None,
    )


@pytest.mark.asyncio
async def test_fixture_phase_key_mapping():
    g = _fixture(1, group_name="Group A")
    assert fixture_phase_key(g) == "groups"
    r32 = _fixture(2, round_name="Round of 32")
    assert fixture_phase_key(r32) == "round_of_32"
    r16 = _fixture(3, round_name="Round of 16")
    assert fixture_phase_key(r16) == "round_of_16"
    qf = _fixture(4, round_name="Quarter-final")
    assert fixture_phase_key(qf) == "quarterfinal"
    third = _fixture(5, round_name="Match for third place")
    assert fixture_phase_key(third) == "third_place"
    fin = _fixture(6, round_name="Final")
    assert fixture_phase_key(fin) == "final"


@pytest.mark.asyncio
async def test_close_phase_resets_points_and_pool(db_session):
    owner = User(
        username="phase_owner",
        hashed_password="x",
        first_name="O",
        last_name="W",
    )
    u2 = User(username="phase_u2", hashed_password="x", first_name="U", last_name="2")
    db_session.add_all([owner, u2])
    await db_session.flush()

    group = Group(
        name="Phase Polla",
        owner_id=owner.id,
        invite_code="phasepolla01",
        entry_fee=Decimal("10"),
        prize_pool=Decimal("50"),
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()

    m1 = GroupMember(group_id=group.id, user_id=owner.id, total_points=15)
    m2 = GroupMember(group_id=group.id, user_id=u2.id, total_points=8)
    db_session.add_all([m1, m2])

    f1 = _fixture(100, group_name="Group A", status="finished")
    f2 = _fixture(101, group_name="Group B", status="finished")
    db_session.add_all([f1, f2])
    await db_session.flush()

    assert await is_phase_complete(db_session, "groups", group)
    from app.models.group_phase import GroupPhaseEnrollment

    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("0"),
        )
    )
    await db_session.flush()

    record = await close_phase(db_session, group, "groups")
    assert record is not None
    assert record.winner_user_id == owner.id
    assert record.winner_points == 15
    assert record.phase_prize_pool == Decimal("50")

    await db_session.refresh(m1)
    await db_session.refresh(m2)
    assert group.prize_pool == Decimal("0")
    assert m1.total_points == 0
    assert m2.total_points == 0
    assert len(record.top_snapshot or []) == 1
    assert record.top_snapshot[0]["user_id"] == str(owner.id)


@pytest.mark.asyncio
async def test_try_close_does_not_duplicate(db_session):
    owner = User(username="dup_owner", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()

    group = Group(
        name="Dup",
        owner_id=owner.id,
        invite_code="duppolla001",
        entry_fee=Decimal("0"),
        prize_pool=Decimal("0"),
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner.id, total_points=5))
    from app.models.group_phase import GroupPhaseEnrollment

    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("0"),
        )
    )
    db_session.add(_fixture(200, group_name="Group A", status="finished"))
    await db_session.flush()

    closed1 = await try_close_completed_phases(db_session, group.id)
    assert closed1 == ["groups"]
    closed2 = await try_close_completed_phases(db_session, group.id)
    assert closed2 == []

    count = await db_session.execute(
        select(PhaseWinnerHistory).where(
            PhaseWinnerHistory.group_id == group.id,
            PhaseWinnerHistory.phase_key == "groups",
        )
    )
    assert len(count.scalars().all()) == 1


@pytest.mark.asyncio
async def test_tournament_progress_payload(db_session):
    owner = User(username="prog_owner", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()
    group = Group(name="Prog", owner_id=owner.id, invite_code="progpolla01", is_active=True)
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner.id))
    db_session.add(_fixture(300, group_name="Group A", status="finished"))
    db_session.add(_fixture(301, group_name="Group B", status="scheduled"))
    await db_session.flush()

    progress = await build_tournament_progress(db_session, group.id)
    assert progress["total_fixtures"] >= 2
    assert len(progress["phases"]) == len(PHASE_ORDER)
    groups_phase = next(p for p in progress["phases"] if p["phase_key"] == "groups")
    assert groups_phase["status"] == "active"
    assert groups_phase["finished_fixtures"] == 1
    assert groups_phase["total_fixtures"] == 2


@pytest.mark.asyncio
async def test_list_phase_winners_admin_shape(db_session):
    from app.services.tournament_phase_service import list_phase_winners_admin

    owner = User(username="api_owner", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()
    group = Group(
        name="API Group",
        owner_id=owner.id,
        invite_code="apipolla001",
        is_active=True,
        prize_pool=Decimal("0"),
    )
    db_session.add(group)
    await db_session.flush()

    phases = await list_phase_winners_admin(db_session, group.id)
    assert len(phases) == 7
    assert phases[0]["phase_key"] == "groups"
    assert phases[5]["phase_key"] == "third_place"
    assert phases[6]["phase_key"] == "final"
    assert phases[0]["status"] == "active"


@pytest.mark.asyncio
async def test_close_phase_saves_full_leaderboard_snapshot(db_session):
    owner = User(username="snap_owner", hashed_password="x")
    u2 = User(username="snap_u2", hashed_password="x")
    u3 = User(username="snap_u3", hashed_password="x")
    db_session.add_all([owner, u2, u3])
    await db_session.flush()

    group = Group(
        name="Snapshot Polla",
        owner_id=owner.id,
        invite_code="snappolla01",
        entry_fee=Decimal("10"),
        prize_pool=Decimal("30"),
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()

    db_session.add_all(
        [
            GroupMember(group_id=group.id, user_id=owner.id, total_points=20),
            GroupMember(group_id=group.id, user_id=u2.id, total_points=12),
            GroupMember(group_id=group.id, user_id=u3.id, total_points=5),
        ]
    )
    from app.models.group_phase import GroupPhaseEnrollment

    for uid in (owner.id, u2.id, u3.id):
        db_session.add(
            GroupPhaseEnrollment(
                group_id=group.id,
                user_id=uid,
                phase_key="groups",
                status="confirmed",
                entry_fee_paid=Decimal("10"),
            )
        )
    db_session.add(_fixture(400, group_name="Group A", status="finished"))
    await db_session.flush()

    record = await close_phase(db_session, group, "groups")
    assert record is not None
    assert len(record.top_snapshot) == 3
    assert record.top_snapshot[0]["total_points"] == 20
    assert record.top_snapshot[1]["total_points"] == 12
    assert record.top_snapshot[2]["total_points"] == 5


@pytest.mark.asyncio
async def test_tournament_progress_includes_phase_winners(db_session):
    owner = User(username="hist_owner", hashed_password="x")
    u2 = User(username="hist_u2", hashed_password="x")
    db_session.add_all([owner, u2])
    await db_session.flush()

    group = Group(
        name="History Polla",
        owner_id=owner.id,
        invite_code="histpolla01",
        entry_fee=Decimal("10"),
        prize_pool=Decimal("20"),
        is_active=True,
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
    )
    db_session.add(group)
    await db_session.flush()

    db_session.add_all(
        [
            GroupMember(group_id=group.id, user_id=owner.id, total_points=18),
            GroupMember(group_id=group.id, user_id=u2.id, total_points=9),
        ]
    )
    from app.models.group_phase import GroupPhaseEnrollment

    for uid in (owner.id, u2.id):
        db_session.add(
            GroupPhaseEnrollment(
                group_id=group.id,
                user_id=uid,
                phase_key="groups",
                status="confirmed",
                entry_fee_paid=Decimal("10"),
            )
        )
    db_session.add(_fixture(500, group_name="Group A", status="finished"))
    await db_session.flush()

    await close_phase(db_session, group, "groups")
    await db_session.refresh(group)

    progress = await build_tournament_progress(db_session, group.id)
    assert len(progress["phase_winners"]) == 1
    hist = progress["phase_winners"][0]
    assert hist["phase_key"] == "groups"
    assert hist["phase_prize_pool"] == "20.00"
    assert hist["participant_count"] == 2
    assert len(hist["top_snapshot"]) == 2
    assert hist["winner"]["user_id"] == str(owner.id)
