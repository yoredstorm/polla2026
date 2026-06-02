"""Per-phase fees, enrollments, and entry proofs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group
from app.models.group_phase import GroupPhaseFee, GroupPhaseEnrollment, GroupPhaseEntryProof
from app.services.tournament_phase_service import PHASE_ORDER, PHASE_LABELS, PhaseKey, next_phase_key_after


async def ensure_phase_fees_for_group(db: AsyncSession, group: Group) -> None:
    result = await db.execute(
        select(GroupPhaseFee.id).where(GroupPhaseFee.group_id == group.id).limit(1)
    )
    if result.scalar_one_or_none() is None:
        await seed_phase_fees_for_group(db, group)


async def seed_phase_fees_for_group(
    db: AsyncSession,
    group: Group,
    *,
    default_entry: Decimal | None = None,
    default_extra: Decimal | None = None,
) -> None:
    entry = default_entry if default_entry is not None else group.entry_fee
    extra = default_extra if default_extra is not None else group.fixed_bet_amount
    for phase_key in PHASE_ORDER:
        existing = await db.execute(
            select(GroupPhaseFee).where(
                and_(GroupPhaseFee.group_id == group.id, GroupPhaseFee.phase_key == phase_key)
            )
        )
        if existing.scalar_one_or_none():
            continue
        db.add(
            GroupPhaseFee(
                group_id=group.id,
                phase_key=phase_key,
                entry_fee=entry,
                extra_per_match=extra,
            )
        )
    await db.flush()


async def get_phase_fee(db: AsyncSession, group_id: uuid.UUID, phase_key: str) -> GroupPhaseFee | None:
    result = await db.execute(
        select(GroupPhaseFee).where(
            and_(GroupPhaseFee.group_id == group_id, GroupPhaseFee.phase_key == phase_key)
        )
    )
    return result.scalar_one_or_none()


async def list_phase_fees(db: AsyncSession, group_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(GroupPhaseFee)
        .where(GroupPhaseFee.group_id == group_id)
        .order_by(GroupPhaseFee.phase_key)
    )
    fees = {f.phase_key: f for f in result.scalars().all()}
    out: list[dict] = []
    for key in PHASE_ORDER:
        f = fees.get(key)
        out.append(
            {
                "phase_key": key,
                "label": PHASE_LABELS[key],
                "entry_fee": str(f.entry_fee) if f else "0.00",
                "extra_per_match": str(f.extra_per_match) if f and f.extra_per_match is not None else None,
            }
        )
    return out


async def update_phase_fees(
    db: AsyncSession,
    group_id: uuid.UUID,
    items: list[dict],
) -> list[dict]:
    for item in items:
        phase_key = item.get("phase_key")
        if phase_key not in PHASE_ORDER:
            continue
        fee = await get_phase_fee(db, group_id, phase_key)
        if not fee:
            fee = GroupPhaseFee(group_id=group_id, phase_key=phase_key)
            db.add(fee)
        if "entry_fee" in item and item["entry_fee"] is not None:
            fee.entry_fee = Decimal(str(item["entry_fee"]))
        if "extra_per_match" in item:
            val = item["extra_per_match"]
            fee.extra_per_match = Decimal(str(val)) if val is not None and val != "" else None
    await db.flush()
    return await list_phase_fees(db, group_id)


async def get_enrollment(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    phase_key: str,
) -> GroupPhaseEnrollment | None:
    result = await db.execute(
        select(GroupPhaseEnrollment).where(
            and_(
                GroupPhaseEnrollment.group_id == group_id,
                GroupPhaseEnrollment.user_id == user_id,
                GroupPhaseEnrollment.phase_key == phase_key,
            )
        )
    )
    return result.scalar_one_or_none()


async def enrollment_status_for_user(
    db: AsyncSession,
    group: Group,
    user_id: uuid.UUID,
) -> str:
    """confirmed | pending | none for group's current phase."""
    phase_key = group.current_phase_key or "groups"
    enr = await get_enrollment(db, group.id, user_id, phase_key)
    if not enr:
        return "none"
    return enr.status if enr.status == "confirmed" else "pending"


async def confirm_phase_enrollment(
    db: AsyncSession,
    group: Group,
    user_id: uuid.UUID,
    phase_key: str,
    admin_id: uuid.UUID,
) -> GroupPhaseEnrollment:
    fee_row = await get_phase_fee(db, group.id, phase_key)
    entry_fee = fee_row.entry_fee if fee_row else Decimal("0.00")

    enr = await get_enrollment(db, group.id, user_id, phase_key)
    if enr and enr.status == "confirmed":
        return enr

    if not enr:
        enr = GroupPhaseEnrollment(
            group_id=group.id,
            user_id=user_id,
            phase_key=phase_key,
            status="pending",
        )
        db.add(enr)

    enr.status = "confirmed"
    enr.entry_fee_paid = entry_fee
    enr.confirmed_at = datetime.now(timezone.utc)
    enr.confirmed_by = admin_id
    group.prize_pool += entry_fee
    await db.flush()
    return enr

