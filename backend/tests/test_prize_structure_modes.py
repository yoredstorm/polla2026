"""Tests for configurable prize structure modes."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, and_

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment, GroupPhaseFee
from app.models.user import User
from app.services.phase_enrollment_service import seed_phase_fees_for_group
from app.services.prize_structure_service import (
    fixture_effective_phase_key,
    get_effective_phases,
)
from app.services.tournament_phase_service import (
    build_tournament_progress,
    close_phase,
    list_phase_winners_admin,
)
from app.services.bet_service import create_bet
from app.schemas.bet import BetCreate


def _fixture(external_id: int, *, group_name=None, round_name=None, status="scheduled"):
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
async def test_seed_fees_single_tournament(db_session):
    user = User(username="single_owner", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="Single",
        owner_id=user.id,
        invite_code="singlepoll01",
        prize_structure_mode="single_tournament",
        current_phase_key="tournament",
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    fees = await db_session.execute(
        select(GroupPhaseFee).where(GroupPhaseFee.group_id == group.id)
    )
    assert len(fees.scalars().all()) == 1
    assert get_effective_phases(group) == ["tournament"]


@pytest.mark.asyncio
async def test_seed_fees_groups_knockout(db_session):
    user = User(username="dual_owner", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="Dual",
        owner_id=user.id,
        invite_code="dualpolla01",
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    fees = await db_session.execute(
        select(GroupPhaseFee).where(GroupPhaseFee.group_id == group.id)
    )
    keys = {f.phase_key for f in fees.scalars().all()}
    assert keys == {"groups", "knockout"}


@pytest.mark.asyncio
async def test_fixture_effective_phase_groups_knockout(db_session):
    user = User(username="map_owner", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="Map",
        owner_id=user.id,
        invite_code="mappolla001",
        prize_structure_mode="groups_knockout",
    )
    db_session.add(group)
    await db_session.flush()
    g = _fixture(1, group_name="Group A")
    ko = _fixture(2, round_name="Round of 16")
    assert fixture_effective_phase_key(g, group) == "groups"
    assert fixture_effective_phase_key(ko, group) == "knockout"


@pytest.mark.asyncio
async def test_close_groups_advances_to_knockout(db_session):
    owner = User(username="gk_owner", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()
    group = Group(
        name="GK",
        owner_id=owner.id,
        invite_code="gkpolla001",
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
        prize_pool=Decimal("40"),
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner.id, total_points=10))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    db_session.add(_fixture(800, group_name="Group A", status="finished"))
    await db_session.flush()

    record = await close_phase(db_session, group, "groups")
    assert record is not None
    await db_session.refresh(group)
    assert group.current_phase_key == "knockout"
    assert group.prize_pool == Decimal("0")


@pytest.mark.asyncio
async def test_bet_knockout_requires_enrollment(db_session):
    user = User(username="ko_bet", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="KO Bet",
        owner_id=user.id,
        invite_code="kobetpoll01",
        prize_structure_mode="groups_knockout",
        current_phase_key="knockout",
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    db_session.add(GroupMember(group_id=group.id, user_id=user.id))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=user.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("0"),
        )
    )
    fx = _fixture(810, round_name="Quarter-final", status="scheduled")
    db_session.add(fx)
    await db_session.flush()

    with pytest.raises(ValueError, match="PHASE_NOT_ENROLLED"):
        await create_bet(
            db_session,
            user.id,
            BetCreate(fixture_id=fx.id, predicted_home_score=1, predicted_away_score=0),
        )


@pytest.mark.asyncio
async def test_progress_single_tournament_one_phase(db_session):
    owner = User(username="prog_single", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()
    group = Group(
        name="Prog Single",
        owner_id=owner.id,
        invite_code="progsing01",
        prize_structure_mode="single_tournament",
        current_phase_key="tournament",
        is_active=True,
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(_fixture(900, group_name="Group A", status="finished"))
    db_session.add(_fixture(901, round_name="Final", status="scheduled"))
    await db_session.flush()

    progress = await build_tournament_progress(db_session, group.id)
    assert len(progress["phases"]) == 1
    assert progress["phases"][0]["phase_key"] == "tournament"
    assert progress["prize_structure_mode"] == "single_tournament"

    admin_phases = await list_phase_winners_admin(db_session, group.id)
    assert len(admin_phases) == 1
