"""
Tournament phase winners: configurable 1, 2, or 7 hitos per polla.
Auto-close when all fixtures in a phase are finished; reset points and prize pool.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.phase_winner import PhaseWinnerHistory
from app.services.prize_structure_service import (
    effective_phase_fixture_filter,
    get_effective_phases,
    next_effective_phase_key,
    phase_label,
    is_effective_phase,
)
from app.services.tournament_phases import (
    PHASE_ORDER,
    PHASE_LABELS,
    PhaseKey,
    fixture_phase_key,
    milestone_phase_fixture_filter,
    next_milestone_phase_key,
)

# Re-export for backward compatibility
phase_fixture_filter = milestone_phase_fixture_filter
next_phase_key_after = next_milestone_phase_key


async def _get_group(db: AsyncSession, group_id: uuid.UUID) -> Group | None:
    result = await db.execute(select(Group).where(Group.id == group_id))
    return result.scalar_one_or_none()


async def count_phase_fixtures(
    db: AsyncSession, phase_key: str, group: Group
) -> tuple[int, int]:
    """Return (total, finished) fixture counts for an effective phase."""
    phase_cond = effective_phase_fixture_filter(phase_key, group)
    total_q = await db.execute(select(func.count()).select_from(Fixture).where(phase_cond))
    finished_q = await db.execute(
        select(func.count()).select_from(Fixture).where(and_(phase_cond, Fixture.status == "finished"))
    )
    return int(total_q.scalar() or 0), int(finished_q.scalar() or 0)


async def is_phase_complete(db: AsyncSession, phase_key: str, group: Group) -> bool:
    total, finished = await count_phase_fixtures(db, phase_key, group)
    return total > 0 and finished >= total


async def _phase_leaderboard(
    db: AsyncSession, group_id: uuid.UUID, phase_key: str
) -> list:
    """Members enrolled in this phase, ranked by total_points."""
    from app.models.user import User

    result = await db.execute(
        select(GroupMember, User)
        .join(User, GroupMember.user_id == User.id)
        .join(
            GroupPhaseEnrollment,
            and_(
                GroupPhaseEnrollment.group_id == group_id,
                GroupPhaseEnrollment.user_id == User.id,
                GroupPhaseEnrollment.phase_key == phase_key,
                GroupPhaseEnrollment.status == "confirmed",
            ),
        )
        .where(GroupMember.group_id == group_id)
        .order_by(GroupMember.total_points.desc(), User.username.asc())
    )
    rows = result.all()
    if not rows:
        return []
    entries = []
    for pos, (member, user) in enumerate(rows, start=1):
        entries.append(
            type(
                "PhaseLeaderEntry",
                (),
                {
                    "position": pos,
                    "user_id": user.id,
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "total_points": member.total_points,
                },
            )()
        )
    return entries


async def get_closed_phase_keys(db: AsyncSession, group_id: uuid.UUID) -> set[str]:
    result = await db.execute(
        select(PhaseWinnerHistory.phase_key).where(PhaseWinnerHistory.group_id == group_id)
    )
    return {row[0] for row in result.all()}


async def get_current_phase_key(db: AsyncSession, group_id: uuid.UUID) -> str | None:
    group = await _get_group(db, group_id)
    if not group:
        return None
    phases = get_effective_phases(group)
    if group.current_phase_key in phases:
        closed = await get_closed_phase_keys(db, group_id)
        if group.current_phase_key not in closed:
            return group.current_phase_key
    closed = await get_closed_phase_keys(db, group_id)
    for key in phases:
        if key not in closed:
            return key
    return None


def _leaderboard_snapshot(entries: list) -> list[dict]:
    """Full frozen ranking for phase transparency (all enrolled participants)."""
    out = []
    for e in entries:
        out.append(
            {
                "position": e.position,
                "user_id": str(e.user_id),
                "username": e.username,
                "first_name": e.first_name,
                "last_name": e.last_name,
                "total_points": e.total_points,
            }
        )
    return out


async def close_phase(
    db: AsyncSession,
    group: Group,
    phase_key: str,
    *,
    closed_by: str = "system",
) -> PhaseWinnerHistory | None:
    """Record phase winner, snapshot full ranking, reset member points and prize pool."""
    if not is_effective_phase(phase_key, group):
        return None

    existing = await db.execute(
        select(PhaseWinnerHistory).where(
            and_(
                PhaseWinnerHistory.group_id == group.id,
                PhaseWinnerHistory.phase_key == phase_key,
            )
        )
    )
    if existing.scalar_one_or_none():
        return None

    prize_at_close = group.prize_pool
    leaderboard = await _phase_leaderboard(db, group.id, phase_key)
    winner_entry = leaderboard[0] if leaderboard else None

    record = PhaseWinnerHistory(
        group_id=group.id,
        phase_key=phase_key,
        winner_user_id=winner_entry.user_id if winner_entry else None,
        winner_points=winner_entry.total_points if winner_entry else 0,
        phase_prize_pool=prize_at_close,
        top_snapshot=_leaderboard_snapshot(leaderboard),
        phase_closed_at=datetime.now(timezone.utc),
        closed_by=closed_by,
    )
    db.add(record)

    members_result = await db.execute(select(GroupMember).where(GroupMember.group_id == group.id))
    for member in members_result.scalars().all():
        member.total_points = 0
    group.prize_pool = Decimal("0.00")
    nxt = next_effective_phase_key(group, phase_key)
    if nxt:
        group.current_phase_key = nxt
    await db.flush()
    if nxt:
        from app.services.group_service import sync_group_prize_pool

        await sync_group_prize_pool(db, group)
    return record


async def try_close_completed_phases(
    db: AsyncSession,
    group_id: uuid.UUID,
    redis=None,
) -> list[str]:
    """
    Close every consecutive completed phase starting from the first unclosed.
    Returns list of phase keys that were closed in this run.
    """
    group = await _get_group(db, group_id)
    if not group:
        return []

    closed_keys: list[str] = []
    closed = await get_closed_phase_keys(db, group_id)

    for phase_key in get_effective_phases(group):
        if phase_key in closed:
            continue
        if not await is_phase_complete(db, phase_key, group):
            break
        record = await close_phase(db, group, phase_key)
        await db.refresh(group)
        closed_keys.append(phase_key)
        closed.add(phase_key)
        if redis:
            if record and record.winner_user_id:
                from app.services.badge_notify_service import notify_new_badges_for_user_social

                await notify_new_badges_for_user_social(db, redis, record.winner_user_id)
            if group.current_phase_key:
                from app.services.phase_enrollment_service import (
                    notify_members_needing_phase_enrollment,
                )

                await notify_members_needing_phase_enrollment(
                    db, redis, group, group.current_phase_key
                )

    return closed_keys


async def get_active_polla(
    db: AsyncSession,
    *,
    competition_id: uuid.UUID | None = None,
) -> Group | None:
    if competition_id is not None:
        from app.services.competition_service import get_group_for_competition

        return await get_group_for_competition(db, competition_id)
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def build_tournament_progress(db: AsyncSession, group_id: uuid.UUID) -> dict:
    """Progress payload for dashboard timeline."""
    from sqlalchemy.orm import selectinload

    group = await _get_group(db, group_id)
    if not group:
        return {
            "total_fixtures": 0,
            "finished_fixtures": 0,
            "current_phase_key": None,
            "phases": [],
            "phase_winners": [],
            "prize_structure_mode": "full_milestones",
        }

    history_result = await db.execute(
        select(PhaseWinnerHistory)
        .where(PhaseWinnerHistory.group_id == group_id)
        .options(selectinload(PhaseWinnerHistory.winner))
        .order_by(PhaseWinnerHistory.phase_closed_at.asc())
    )
    history_rows = history_result.scalars().all()
    history_by_key = {h.phase_key: h for h in history_rows}
    closed = set(history_by_key.keys())
    current = await get_current_phase_key(db, group_id)

    phases_out: list[dict] = []
    cumulative_end = 0
    grand_total = 0
    grand_finished = 0

    for phase_key in get_effective_phases(group):
        total, finished = await count_phase_fixtures(db, phase_key, group)
        grand_total += total
        grand_finished += finished
        cumulative_end += total
        if phase_key in closed:
            status = "closed"
        elif phase_key == current:
            status = "active"
        else:
            status = "pending"
        hist = history_by_key.get(phase_key)
        phases_out.append(
            {
                "phase_key": phase_key,
                "label": phase_label(phase_key, group),
                "total_fixtures": total,
                "finished_fixtures": finished,
                "status": status,
                "milestone_end": cumulative_end,
                "winner": _history_winner_dict(hist) if hist else None,
            }
        )

    return {
        "total_fixtures": grand_total,
        "finished_fixtures": grand_finished,
        "current_phase_key": current,
        "phases": phases_out,
        "phase_winners": [_history_out(h, group) for h in history_rows],
        "prize_structure_mode": group.prize_structure_mode,
    }


def _history_winner_dict(h: PhaseWinnerHistory | None) -> dict | None:
    if not h or not h.winner_user_id:
        return None
    return {
        "user_id": str(h.winner_user_id),
        "points": h.winner_points,
        "prize_pool": str(h.phase_prize_pool),
        "closed_at": h.phase_closed_at.isoformat(),
    }


def _history_out(h: PhaseWinnerHistory, group: Group) -> dict:
    winner = None
    if h.winner and h.winner_user_id:
        winner = {
            "user_id": str(h.winner_user_id),
            "username": h.winner.username,
            "first_name": h.winner.first_name,
            "last_name": h.winner.last_name,
            "points": h.winner_points,
            "prize_pool": str(h.phase_prize_pool),
        }
    elif h.winner_user_id:
        winner = {
            "user_id": str(h.winner_user_id),
            "points": h.winner_points,
            "prize_pool": str(h.phase_prize_pool),
        }
    snapshot = h.top_snapshot or []
    return {
        "phase_key": h.phase_key,
        "label": phase_label(h.phase_key, group),
        "closed_at": h.phase_closed_at.isoformat(),
        "closed_by": h.closed_by,
        "phase_prize_pool": str(h.phase_prize_pool),
        "participant_count": len(snapshot),
        "winner": winner,
        "top_snapshot": snapshot,
    }


async def list_phase_winners_admin(db: AsyncSession, group_id: uuid.UUID) -> list[dict]:
    """All effective phases with closed history or pending status."""
    from sqlalchemy.orm import selectinload

    group = await _get_group(db, group_id)
    if not group:
        return []

    history_result = await db.execute(
        select(PhaseWinnerHistory)
        .where(PhaseWinnerHistory.group_id == group_id)
        .options(selectinload(PhaseWinnerHistory.winner))
        .order_by(PhaseWinnerHistory.phase_closed_at.asc())
    )
    history_by_key = {h.phase_key: h for h in history_result.scalars().all()}
    current = await get_current_phase_key(db, group_id)
    out: list[dict] = []
    for phase_key in get_effective_phases(group):
        total, finished = await count_phase_fixtures(db, phase_key, group)
        hist = history_by_key.get(phase_key)
        if hist:
            status = "closed"
        elif phase_key == current:
            status = "active"
        else:
            status = "pending"
        entry = {
            "phase_key": phase_key,
            "label": phase_label(phase_key, group),
            "status": status,
            "total_fixtures": total,
            "finished_fixtures": finished,
            "winner": None,
            "top_snapshot": [],
            "closed_at": None,
            "phase_prize_pool": None,
        }
        if hist:
            entry["closed_at"] = hist.phase_closed_at.isoformat()
            entry["phase_prize_pool"] = str(hist.phase_prize_pool)
            entry["top_snapshot"] = hist.top_snapshot or []
            if hist.winner and hist.winner_user_id:
                entry["winner"] = {
                    "user_id": str(hist.winner_user_id),
                    "username": hist.winner.username,
                    "first_name": hist.winner.first_name,
                    "last_name": hist.winner.last_name,
                    "points": hist.winner_points,
                    "prize_pool": str(hist.phase_prize_pool),
                }
        out.append(entry)
    return out
