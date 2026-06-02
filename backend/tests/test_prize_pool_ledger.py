"""Prize pool must reflect confirmed payments only (no duplicate joins)."""
from decimal import Decimal

import pytest
from sqlalchemy import select, and_

from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.user import User
from app.services.group_service import join_group, compute_confirmed_prize_pool, sync_group_prize_pool
from app.services.phase_enrollment_service import confirm_phase_enrollment, seed_phase_fees_for_group


@pytest.mark.asyncio
async def test_join_group_does_not_inflate_prize_pool(db_session):
    owner = User(username="pool_owner", hashed_password="x")
    joiner = User(username="pool_joiner", hashed_password="x")
    db_session.add_all([owner, joiner])
    await db_session.flush()

    group = Group(
        name="Pool Test",
        owner_id=owner.id,
        invite_code="pooltest001",
        entry_fee=Decimal("30"),
        is_active=True,
        prize_pool=Decimal("0"),
    )
    db_session.add(group)
    await db_session.flush()
    db_session.add(GroupMember(group_id=group.id, user_id=owner.id))
    await db_session.flush()

    await join_group(db_session, joiner.id, "pooltest001")
    assert group.prize_pool == Decimal("0")

    await seed_phase_fees_for_group(db_session, group)
    await confirm_phase_enrollment(db_session, group, joiner.id, "groups", owner.id)
    assert group.prize_pool == Decimal("30")

    computed = await compute_confirmed_prize_pool(db_session, group.id)
    assert computed == Decimal("30")


@pytest.mark.asyncio
async def test_sync_repairs_inflated_cached_pool(db_session):
    user = User(username="sync_user", hashed_password="x")
    db_session.add(user)
    await db_session.flush()

    group = Group(
        name="Sync",
        owner_id=user.id,
        invite_code="syncpool001",
        entry_fee=Decimal("30"),
        prize_pool=Decimal("90"),
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
            entry_fee_paid=Decimal("30"),
        )
    )
    await db_session.flush()

    await sync_group_prize_pool(db_session, group)
    assert group.prize_pool == Decimal("30")
