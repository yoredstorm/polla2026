"""Per-phase fees, enrollments, and entry proofs."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseFee, GroupPhaseEnrollment, GroupPhaseEntryProof
from app.services.prize_structure_service import (
    get_effective_phases,
    next_effective_phase_key,
    phase_label,
    is_effective_phase,
)

EnrollmentStatus = Literal["confirmed", "pending", "none"]


@dataclass
class PaymentTargetPhase:
    phase_key: str
    label: str
    entry_fee: Decimal
    enrollment_status: EnrollmentStatus
    has_uploaded_proof: bool
    is_early_enrollment: bool


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
    for phase_key in get_effective_phases(group):
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
    from app.services.tournament_phase_service import _get_group

    group = await _get_group(db, group_id)
    if not group:
        return []

    result = await db.execute(
        select(GroupPhaseFee)
        .where(GroupPhaseFee.group_id == group_id)
        .order_by(GroupPhaseFee.phase_key)
    )
    fees = {f.phase_key: f for f in result.scalars().all()}
    out: list[dict] = []
    for key in get_effective_phases(group):
        f = fees.get(key)
        out.append(
            {
                "phase_key": key,
                "label": phase_label(key, group),
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
    from app.services.tournament_phase_service import _get_group

    group = await _get_group(db, group_id)
    if not group:
        return []

    for item in items:
        phase_key = item.get("phase_key")
        if not phase_key or not is_effective_phase(phase_key, group):
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


async def enrollment_status_for_phase(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    phase_key: str,
) -> EnrollmentStatus:
    enr = await get_enrollment(db, group_id, user_id, phase_key)
    if not enr:
        return "none"
    return "confirmed" if enr.status == "confirmed" else "pending"


async def enrollment_status_for_user(
    db: AsyncSession,
    group: Group,
    user_id: uuid.UUID,
) -> str:
    """confirmed | pending | none for group's current phase."""
    phase_key = group.current_phase_key or get_effective_phases(group)[0]
    return await enrollment_status_for_phase(db, group.id, user_id, phase_key)


async def _has_phase_proof(
    db: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID, phase_key: str
) -> bool:
    result = await db.execute(
        select(GroupPhaseEntryProof).where(
            and_(
                GroupPhaseEntryProof.group_id == group_id,
                GroupPhaseEntryProof.user_id == user_id,
                GroupPhaseEntryProof.phase_key == phase_key,
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def resolve_payment_target_phase(
    db: AsyncSession,
    group: Group,
    user_id: uuid.UUID,
    *,
    is_member: bool,
) -> PaymentTargetPhase | None:
    """Phase the user should pay for next (current or early next-phase enrollment)."""
    phases = get_effective_phases(group)
    first_phase = phases[0]
    current = group.current_phase_key or first_phase

    if not is_member:
        if current != first_phase:
            return None
        fee_row = await get_phase_fee(db, group.id, first_phase)
        entry_fee = fee_row.entry_fee if fee_row else group.entry_fee
        from app.models.group import GroupEntryProof

        proof_res = await db.execute(
            select(GroupEntryProof).where(
                and_(GroupEntryProof.group_id == group.id, GroupEntryProof.user_id == user_id)
            )
        )
        return PaymentTargetPhase(
            phase_key=first_phase,
            label=phase_label(first_phase, group),
            entry_fee=entry_fee,
            enrollment_status="none",
            has_uploaded_proof=proof_res.scalar_one_or_none() is not None,
            is_early_enrollment=False,
        )

    current_status = await enrollment_status_for_phase(db, group.id, user_id, current)
    if current_status != "confirmed":
        fee_row = await get_phase_fee(db, group.id, current)
        entry_fee = fee_row.entry_fee if fee_row else group.entry_fee
        return PaymentTargetPhase(
            phase_key=current,
            label=phase_label(current, group),
            entry_fee=entry_fee,
            enrollment_status=current_status,
            has_uploaded_proof=await _has_phase_proof(db, group.id, user_id, current),
            is_early_enrollment=False,
        )

    next_key = next_effective_phase_key(group, current)
    if not next_key:
        return None

    next_status = await enrollment_status_for_phase(db, group.id, user_id, next_key)
    if next_status == "confirmed":
        return None

    fee_row = await get_phase_fee(db, group.id, next_key)
    entry_fee = fee_row.entry_fee if fee_row else group.entry_fee
    return PaymentTargetPhase(
        phase_key=next_key,
        label=phase_label(next_key, group),
        entry_fee=entry_fee,
        enrollment_status=next_status,
        has_uploaded_proof=await _has_phase_proof(db, group.id, user_id, next_key),
        is_early_enrollment=True,
    )


def is_allowed_proof_phase_key(
    group: Group,
    *,
    is_member: bool,
    current_status: EnrollmentStatus,
    phase_key: str,
) -> bool:
    phases = get_effective_phases(group)
    first_phase = phases[0]
    current = group.current_phase_key or first_phase
    next_key = next_effective_phase_key(group, current)

    if not is_member:
        return phase_key == first_phase and current == first_phase
    if phase_key == current:
        return current_status != "confirmed"
    if next_key and phase_key == next_key:
        return current_status == "confirmed"
    return False


async def notify_members_needing_phase_enrollment(
    db: AsyncSession,
    redis,
    group: Group,
    phase_key: str,
) -> None:
    """Notify polla members who lack confirmed enrollment for the given phase."""
    from app.services.notification_service import create_notification

    label = phase_label(phase_key, group)
    members = await db.execute(
        select(GroupMember.user_id).where(GroupMember.group_id == group.id)
    )
    for (user_id,) in members.all():
        status = await enrollment_status_for_phase(db, group.id, user_id, phase_key)
        if status == "confirmed":
            continue
        await create_notification(
            db,
            redis,
            user_id=user_id,
            type="phase_entry_pending",
            title=f"Inscripción abierta — {label}",
            body=(
                f"La fase anterior terminó. Paga e inscríbete en {label} "
                "para seguir apostando en la polla."
            ),
            payload={
                "group_id": str(group.id),
                "user_id": str(user_id),
                "phase_key": phase_key,
                "phase_closed": True,
            },
        )


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
    from app.services.group_service import sync_group_prize_pool

    await sync_group_prize_pool(db, group)
    await db.flush()
    return enr
