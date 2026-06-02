"""Tests for phase enrollment, third_place phase, and fixture filters."""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, and_

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment, GroupPhaseFee
from app.models.user import User
from app.services.phase_enrollment_service import (
    confirm_phase_enrollment,
    seed_phase_fees_for_group,
)
from app.services.prize_structure_service import (
    effective_phase_fixture_filter,
    fixture_effective_phase_key,
    get_effective_phases,
)
from app.services.tournament_phase_service import (
    PHASE_ORDER,
    fixture_phase_key,
    phase_fixture_filter,
    close_phase,
    _phase_leaderboard,
)
from app.services.bet_service import create_bet
from app.schemas.bet import BetCreate


def _fixture(external_id: int, *, group_name=None, round_name=None, status="finished"):
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
async def test_phase_fixture_filter_third_place(db_session):
    owner = User(username="filt_owner", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()
    group = Group(
        name="Filter",
        owner_id=owner.id,
        invite_code="filtpolla01",
        prize_structure_mode="full_milestones",
    )
    db_session.add(group)
    await db_session.flush()

    third = _fixture(701, round_name="Match for third place")
    final = _fixture(702, round_name="Final")
    db_session.add_all([third, final])
    await db_session.flush()

    cond = effective_phase_fixture_filter("third_place", group)
    result = await db_session.execute(select(Fixture).where(cond))
    rounds = {fx.round for fx in result.scalars().all()}
    assert "Match for third place" in rounds
    assert "Final" not in rounds


@pytest.mark.asyncio
async def test_third_place_separate_from_final():
    third = _fixture(1, round_name="Match for third place")
    final = _fixture(2, round_name="Final")
    assert fixture_phase_key(third) == "third_place"
    assert fixture_phase_key(final) == "final"
    assert "third_place" in PHASE_ORDER
    assert PHASE_ORDER.index("third_place") < PHASE_ORDER.index("final")


@pytest.mark.asyncio
async def test_close_phase_only_enrolled_members(db_session):
    owner = User(username="owner_enr", hashed_password="x")
    other = User(username="other_enr", hashed_password="x")
    db_session.add_all([owner, other])
    await db_session.flush()

    group = Group(
        name="Enr Polla",
        owner_id=owner.id,
        invite_code="enrpolla001",
        is_active=True,
        current_phase_key="groups",
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)

    m_owner = GroupMember(group_id=group.id, user_id=owner.id, total_points=20)
    m_other = GroupMember(group_id=group.id, user_id=other.id, total_points=50)
    db_session.add_all([m_owner, m_other])
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    db_session.add(_fixture(500, group_name="Group A", status="finished"))
    await db_session.flush()

    lb = await _phase_leaderboard(db_session, group.id, "groups")
    assert len(lb) == 1
    assert lb[0].user_id == owner.id

    group.prize_pool = Decimal("100")
    await close_phase(db_session, group, "groups")
    await db_session.refresh(group)
    assert group.current_phase_key == "round_of_32"
    assert group.prize_pool == Decimal("0")


@pytest.mark.asyncio
async def test_confirm_phase_enrollment_adds_to_pool(db_session):
    user = User(username="fee_user", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="Fee",
        owner_id=user.id,
        invite_code="feepolla001",
        current_phase_key="round_of_16",
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    fee = await db_session.execute(
        select(GroupPhaseFee).where(
            and_(GroupPhaseFee.group_id == group.id, GroupPhaseFee.phase_key == "round_of_16")
        )
    )
    row = fee.scalar_one()
    row.entry_fee = Decimal("25")
    await db_session.flush()

    db_session.add(GroupMember(group_id=group.id, user_id=user.id))
    await confirm_phase_enrollment(db_session, group, user.id, "round_of_16", user.id)
    assert group.prize_pool == Decimal("25")


@pytest.mark.asyncio
async def test_create_bet_requires_phase_enrollment(db_session):
    user = User(username="bet_phase", hashed_password="x")
    db_session.add(user)
    await db_session.flush()
    group = Group(
        name="Bet Phase",
        owner_id=user.id,
        invite_code="betphase001",
        is_active=True,
        current_phase_key="round_of_16",
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    db_session.add(GroupMember(group_id=group.id, user_id=user.id))
    fx = _fixture(600, round_name="Round of 16", status="scheduled")
    db_session.add(fx)
    await db_session.flush()

    with pytest.raises(ValueError, match="PHASE_NOT_ENROLLED"):
        await create_bet(
            db_session,
            user.id,
            BetCreate(fixture_id=fx.id, predicted_home_score=1, predicted_away_score=0),
        )
