"""Early next-phase enrollment while the current tournament phase is still active."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select, and_

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment, GroupPhaseEntryProof
from app.models.user import User
from app.schemas.bet import BetCreate
from app.services.bet_service import create_bet
from app.services.group_service import compute_confirmed_prize_pool, sync_group_prize_pool
from app.services.phase_enrollment_service import (
    confirm_phase_enrollment,
    is_allowed_proof_phase_key,
    resolve_payment_target_phase,
    seed_phase_fees_for_group,
    enrollment_status_for_phase,
)
from app.services.tournament_phase_service import close_phase


def _fixture(external_id: int, *, group_name=None, round_name=None, status="scheduled"):
    match_date = datetime(2026, 12, 1, tzinfo=timezone.utc)
    if status == "finished":
        match_date = datetime(2026, 6, 11, tzinfo=timezone.utc)
    return Fixture(
        external_id=external_id,
        home_team="A",
        away_team="B",
        league_name="WC",
        league_id=1,
        match_date=match_date,
        status=status,
        season=2026,
        round=round_name,
        group_name=group_name,
        home_score=1 if status == "finished" else None,
        away_score=0 if status == "finished" else None,
        betting_open=True,
    )


async def _groups_knockout_polla(db_session, owner: User) -> Group:
    group = Group(
        name="Early KO",
        owner_id=owner.id,
        invite_code="earlyko0001",
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
        is_active=True,
        entry_fee=Decimal("10"),
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)
    return group


@pytest.mark.asyncio
async def test_resolve_payment_target_early_knockout_during_groups(db_session):
    user = User(username="early_user", hashed_password="x")
    db_session.add(user)
    await db_session.flush()

    group = await _groups_knockout_polla(db_session, user)
    db_session.add(GroupMember(group_id=group.id, user_id=user.id))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=user.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    await db_session.flush()

    target = await resolve_payment_target_phase(
        db_session, group, user.id, is_member=True
    )
    assert target is not None
    assert target.phase_key == "knockout"
    assert target.is_early_enrollment is True
    assert target.enrollment_status == "none"

    assert is_allowed_proof_phase_key(
        group,
        is_member=True,
        current_status="confirmed",
        phase_key="knockout",
    )


@pytest.mark.asyncio
async def test_early_knockout_proof_allowed_during_groups(db_session):
    user = User(username="proof_user", hashed_password="x")
    db_session.add(user)
    await db_session.flush()

    group = await _groups_knockout_polla(db_session, user)
    db_session.add(GroupMember(group_id=group.id, user_id=user.id))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=user.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    db_session.add(
        GroupPhaseEntryProof(
            group_id=group.id,
            user_id=user.id,
            phase_key="knockout",
            file_path="proofs/knockout.jpg",
        )
    )
    await db_session.flush()

    target = await resolve_payment_target_phase(
        db_session, group, user.id, is_member=True
    )
    assert target is not None
    assert target.phase_key == "knockout"
    assert target.has_uploaded_proof is True
    assert target.enrollment_status == "none"


@pytest.mark.asyncio
async def test_prize_pool_current_phase_only(db_session):
    admin = User(username="pool_admin", hashed_password="x")
    member = User(username="pool_member", hashed_password="x")
    db_session.add_all([admin, member])
    await db_session.flush()

    group = await _groups_knockout_polla(db_session, admin)
    db_session.add_all(
        [
            GroupMember(group_id=group.id, user_id=admin.id),
            GroupMember(group_id=group.id, user_id=member.id),
        ]
    )
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=admin.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    await confirm_phase_enrollment(db_session, group, member.id, "knockout", admin.id)
    await db_session.flush()

    pool = await compute_confirmed_prize_pool(db_session, group.id)
    assert pool == Decimal("10")

    await sync_group_prize_pool(db_session, group)
    assert group.prize_pool == Decimal("10")


@pytest.mark.asyncio
async def test_knockout_bet_after_groups_close_only_if_paid(db_session):
    paid = User(username="paid_ko", hashed_password="x")
    unpaid = User(username="unpaid_ko", hashed_password="x")
    db_session.add_all([paid, unpaid])
    await db_session.flush()

    group = await _groups_knockout_polla(db_session, paid)
    group.prize_pool = Decimal("20")
    db_session.add_all(
        [
            GroupMember(group_id=group.id, user_id=paid.id, total_points=12),
            GroupMember(group_id=group.id, user_id=unpaid.id, total_points=8),
        ]
    )
    for uid in (paid.id, unpaid.id):
        db_session.add(
            GroupPhaseEnrollment(
                group_id=group.id,
                user_id=uid,
                phase_key="groups",
                status="confirmed",
                entry_fee_paid=Decimal("10"),
            )
        )
    await confirm_phase_enrollment(db_session, group, paid.id, "knockout", paid.id)
    db_session.add(_fixture(901, group_name="Group A", status="finished"))
    await db_session.flush()

    await close_phase(db_session, group, "groups")
    await db_session.refresh(group)
    assert group.current_phase_key == "knockout"

    ko_fixture = _fixture(902, round_name="Round of 16", status="scheduled")
    db_session.add(ko_fixture)
    await db_session.flush()

    bet = await create_bet(
        db_session,
        paid.id,
        BetCreate(fixture_id=ko_fixture.id, predicted_home_score=2, predicted_away_score=1),
    )
    assert bet.id is not None

    with pytest.raises(ValueError, match="PHASE_NOT_ENROLLED"):
        await create_bet(
            db_session,
            unpaid.id,
            BetCreate(fixture_id=ko_fixture.id, predicted_home_score=0, predicted_away_score=0),
        )


@pytest.mark.asyncio
async def test_close_groups_advances_with_early_knockout_enrollees(db_session):
    owner = User(username="gk_early", hashed_password="x")
    db_session.add(owner)
    await db_session.flush()

    group = await _groups_knockout_polla(db_session, owner)
    group.prize_pool = Decimal("10")
    db_session.add(GroupMember(group_id=group.id, user_id=owner.id, total_points=5))
    db_session.add(
        GroupPhaseEnrollment(
            group_id=group.id,
            user_id=owner.id,
            phase_key="groups",
            status="confirmed",
            entry_fee_paid=Decimal("10"),
        )
    )
    await confirm_phase_enrollment(db_session, group, owner.id, "knockout", owner.id)
    db_session.add(_fixture(903, group_name="Group B", status="finished"))
    await db_session.flush()

    record = await close_phase(db_session, group, "groups")
    assert record is not None
    await db_session.refresh(group)
    assert group.current_phase_key == "knockout"

    status = await enrollment_status_for_phase(db_session, group.id, owner.id, "knockout")
    assert status == "confirmed"

    pool = await compute_confirmed_prize_pool(db_session, group.id)
    assert pool == Decimal("10")
