"""
Group service — creation, joining, leaderboard, prize pool.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, desc, cast, Float
import structlog

from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.user import User
from app.schemas.group import GroupCreate, LeaderboardEntry, BadgeOut
from app.services.avatar_service import avatar_display_path
from app.services.challenge_service import compute_challenge_stats, compute_bet_points_for_ranking
from app.services.gamification_service import compute_badges

logger = structlog.get_logger(__name__)


async def count_phase_enrolled_members(
    db: AsyncSession,
    group_id: uuid.UUID,
    phase_key: str,
) -> int:
    """Confirmed phase enrollments for participant count in the active phase."""
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(GroupPhaseEnrollment)
                .where(
                    and_(
                        GroupPhaseEnrollment.group_id == group_id,
                        GroupPhaseEnrollment.phase_key == phase_key,
                        GroupPhaseEnrollment.status == "confirmed",
                    )
                )
            )
        ).scalar()
        or 0
    )


async def count_admin_pending_entries(db: AsyncSession, group: Group) -> int:
    """Users with uploaded payment proof awaiting admin approval (group + phase)."""
    from app.models.group import GroupEntryProof
    from app.models.group_phase import GroupPhaseEntryProof
    from app.services.prize_structure_service import get_effective_phases

    gid = group.id
    pk = group.current_phase_key or get_effective_phases(group)[0]
    member_ids_q = select(GroupMember.user_id).where(GroupMember.group_id == gid)
    pending_ids: set[uuid.UUID] = set()

    group_proof_ids = select(GroupEntryProof.user_id).where(GroupEntryProof.group_id == gid)
    group_rows = (
        await db.execute(
            select(User.id).where(
                User.is_active == True,  # noqa: E712
                User.id.not_in(member_ids_q),
                User.id.in_(group_proof_ids),
            )
        )
    ).all()
    pending_ids.update(r[0] for r in group_rows)

    confirmed_enr = select(GroupPhaseEnrollment.user_id).where(
        GroupPhaseEnrollment.group_id == gid,
        GroupPhaseEnrollment.phase_key == pk,
        GroupPhaseEnrollment.status == "confirmed",
    )
    phase_proof_users = select(GroupPhaseEntryProof.user_id).where(
        GroupPhaseEntryProof.group_id == gid,
        GroupPhaseEntryProof.phase_key == pk,
    )
    member_rows = (
        await db.execute(
            select(GroupMember.user_id).where(
                GroupMember.group_id == gid,
                GroupMember.user_id.in_(phase_proof_users),
                GroupMember.user_id.not_in(confirmed_enr),
            )
        )
    ).all()
    pending_ids.update(r[0] for r in member_rows)

    if pk == "knockout":
        ko_rows = (
            await db.execute(
                select(User.id).where(
                    User.is_active == True,  # noqa: E712
                    User.id.not_in(member_ids_q),
                    User.id.in_(phase_proof_users),
                )
            )
        ).all()
        pending_ids.update(r[0] for r in ko_rows)

    return len(pending_ids)


async def count_phase_pending_entries(
    db: AsyncSession,
    group: Group,
    phase_key: str,
) -> int:
    """Users with phase entry proof awaiting confirmation for a specific phase."""
    pending = await gather_phase_pending_entries(db, group, phase_key)
    return len(pending)


async def gather_phase_pending_entries(
    db: AsyncSession,
    group: Group,
    phase_key: str,
) -> list[dict]:
    """Users with uploaded phase proof awaiting admin confirmation."""
    from app.models.group_phase import GroupPhaseEntryProof
    from app.services.prize_structure_service import phase_label
    from app.services.payment_upload_service import phase_entry_proof_data_url

    group_id = group.id
    pk = phase_key
    members_q = (
        select(User, GroupMember, GroupPhaseEntryProof)
        .join(GroupMember, GroupMember.user_id == User.id)
        .outerjoin(
            GroupPhaseEntryProof,
            and_(
                GroupPhaseEntryProof.group_id == group_id,
                GroupPhaseEntryProof.user_id == User.id,
                GroupPhaseEntryProof.phase_key == pk,
            ),
        )
        .where(GroupMember.group_id == group_id)
    )
    rows = (await db.execute(members_q)).all()
    out: list[dict] = []
    seen_user_ids: set[uuid.UUID] = set()
    for user, _member, proof in rows:
        enr_res = await db.execute(
            select(GroupPhaseEnrollment).where(
                and_(
                    GroupPhaseEnrollment.group_id == group_id,
                    GroupPhaseEnrollment.user_id == user.id,
                    GroupPhaseEnrollment.phase_key == pk,
                )
            )
        )
        enr = enr_res.scalar_one_or_none()
        if enr and enr.status == "confirmed":
            continue
        if not proof:
            continue
        seen_user_ids.add(user.id)
        out.append(
            {
                "user_id": str(user.id),
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "phase_key": pk,
                "phase_label": phase_label(pk, group),
                "has_proof": True,
                "proof_url": phase_entry_proof_data_url(group_id, user.id, pk),
                "is_member": True,
            }
        )

    if pk == "knockout":
        member_ids_q = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
        non_member_q = (
            select(User, GroupPhaseEntryProof)
            .join(
                GroupPhaseEntryProof,
                and_(
                    GroupPhaseEntryProof.user_id == User.id,
                    GroupPhaseEntryProof.group_id == group_id,
                    GroupPhaseEntryProof.phase_key == pk,
                ),
            )
            .where(User.is_active == True, User.id.not_in(member_ids_q))  # noqa: E712
        )
        for user, _proof in (await db.execute(non_member_q)).all():
            if user.id in seen_user_ids:
                continue
            out.append(
                {
                    "user_id": str(user.id),
                    "username": user.username,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "phase_key": pk,
                    "phase_label": phase_label(pk, group),
                    "has_proof": True,
                    "proof_url": phase_entry_proof_data_url(group_id, user.id, pk),
                    "is_member": False,
                }
            )
    return out


async def list_all_phase_pending_groups(db: AsyncSession, group: Group) -> dict:
    """All phases that have at least one pending phase enrollment."""
    from app.services.prize_structure_service import get_effective_phases, phase_label

    phases_out: list[dict] = []
    for pk in get_effective_phases(group):
        pending = await gather_phase_pending_entries(db, group, pk)
        if pending:
            phases_out.append(
                {
                    "phase_key": pk,
                    "phase_label": phase_label(pk, group),
                    "pending": pending,
                }
            )
    return {"group_id": str(group.id), "phases": phases_out}


async def count_pending_new_member_entries(db: AsyncSession, group: Group) -> int:
    """Non-members with initial group entry proof only (not phase re-enrollment)."""
    from app.models.group import GroupEntryProof

    gid = group.id
    member_ids_q = select(GroupMember.user_id).where(GroupMember.group_id == gid)
    group_proof_ids = select(GroupEntryProof.user_id).where(GroupEntryProof.group_id == gid)
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(User)
                .where(
                    User.is_active == True,  # noqa: E712
                    User.id.not_in(member_ids_q),
                    User.id.in_(group_proof_ids),
                )
            )
        ).scalar()
        or 0
    )


async def count_all_phase_pending_entries(db: AsyncSession, group: Group) -> int:
    """Pending phase enrollments across every effective phase of the pool."""
    from app.services.prize_structure_service import get_effective_phases

    total = 0
    for phase_key in get_effective_phases(group):
        total += await count_phase_pending_entries(db, group, phase_key)
    return total


async def compute_confirmed_prize_pool(
    db: AsyncSession,
    group_id: uuid.UUID,
    *,
    phase_key: str | None = None,
) -> Decimal:
    """Sum confirmed entry fees and confirmed extras for the given tournament phase."""
    group_row = await db.execute(select(Group).where(Group.id == group_id))
    group = group_row.scalar_one_or_none()
    if phase_key is None:
        if group:
            from app.services.prize_structure_service import get_effective_phases

            phase_key = group.current_phase_key or get_effective_phases(group)[0]
        else:
            phase_key = "groups"

    enr_sum = (
        await db.execute(
            select(func.coalesce(func.sum(GroupPhaseEnrollment.entry_fee_paid), 0)).where(
                and_(
                    GroupPhaseEnrollment.group_id == group_id,
                    GroupPhaseEnrollment.phase_key == phase_key,
                    GroupPhaseEnrollment.status == "confirmed",
                )
            )
        )
    ).scalar()

    extras_sum = Decimal("0")
    if group:
        from app.services.prize_structure_service import effective_phase_fixture_filter

        phase_cond = effective_phase_fixture_filter(phase_key, group)
        extras_sum = Decimal(
            str(
                (
                    await db.execute(
                        select(func.coalesce(func.sum(Bet.amount), 0))
                        .select_from(Bet)
                        .join(Fixture, Bet.fixture_id == Fixture.id)
                        .where(
                            and_(
                                Bet.group_id == group_id,
                                Bet.amount > 0,
                                Bet.amount_confirmed == True,  # noqa: E712
                                Bet.cancelled_at.is_(None),
                                phase_cond,
                            )
                        )
                    )
                ).scalar()
                or 0
            )
        )

    return Decimal(str(enr_sum or 0)) + extras_sum


async def sync_group_prize_pool(db: AsyncSession, group: Group) -> Decimal:
    """Align cached prize_pool with confirmed payments."""
    pool = await compute_confirmed_prize_pool(db, group.id)
    group.prize_pool = pool
    await db.flush()
    return pool


async def create_group(db: AsyncSession, owner_id: uuid.UUID, data: GroupCreate) -> Group:
    group = Group(
        name=data.name,
        description=data.description,
        owner_id=owner_id,
        max_members=data.max_members,
        entry_fee=data.entry_fee,
        currency=data.currency,
        bet_amount_mode=data.bet_amount_mode,
        fixed_bet_amount=data.fixed_bet_amount,
    )
    db.add(group)
    await db.flush()

    # Owner is the first member
    member = GroupMember(
        group_id=group.id,
        user_id=owner_id,
        total_amount_bet=Decimal("0.00"),
    )
    db.add(member)

    await db.flush()
    await db.refresh(group)
    return group


async def join_group(db: AsyncSession, user_id: uuid.UUID, invite_code: str) -> Group:
    result = await db.execute(
        select(Group).where(and_(Group.invite_code == invite_code, Group.is_active == True))
    )
    group = result.scalar_one_or_none()
    if not group:
        raise ValueError("GROUP_NOT_FOUND")

    # Check already member
    existing = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == user_id)
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("ALREADY_MEMBER")

    # Check capacity
    count_result = await db.execute(
        select(func.count()).where(GroupMember.group_id == group.id)
    )
    member_count = count_result.scalar()
    if member_count >= group.max_members:
        raise ValueError("GROUP_FULL")

    member = GroupMember(
        group_id=group.id,
        user_id=user_id,
        total_amount_bet=Decimal("0.00"),
    )
    db.add(member)
    await db.flush()
    await db.refresh(group)
    return group


def _leaderboard_subquery(*, week_start: datetime | None = None):
    cond = [Bet.cancelled_at.is_(None)]
    if week_start is not None:
        cond.append(Bet.created_at >= week_start)
    where_clause = and_(*cond)
    scoring_bet = or_(Bet.amount <= 0, Bet.amount_confirmed == True)  # noqa: E712
    settled_bet = and_(
        scoring_bet,
        Bet.points_earned.isnot(None),
        Bet.cancelled_at.is_(None),
    )
    fixture_best = (
        select(
            Bet.user_id.label("fb_user_id"),
            Bet.fixture_id.label("fixture_id"),
            func.max(Bet.points_earned).label("best_pts"),
        )
        .where(settled_bet)
        .group_by(Bet.user_id, Bet.fixture_id)
    ).subquery()
    user_fixture_stats = (
        select(
            fixture_best.c.fb_user_id.label("stats_user_id"),
            func.count().label("settled_bets"),
            func.count().filter(fixture_best.c.best_pts > 0).label("correct_results"),
            func.count().filter(fixture_best.c.best_pts == 0).label("wrong_results"),
            func.coalesce(func.sum(fixture_best.c.best_pts), 0).label("total_points"),
        )
        .group_by(fixture_best.c.fb_user_id)
    ).subquery()
    wager_counts = (
        select(
            Bet.user_id.label("wager_user_id"),
            func.count().label("wager_count"),
        )
        .where(where_clause)
        .group_by(Bet.user_id)
    ).subquery()
    return (
        select(
            User.id.label("user_id"),
            User.username.label("username"),
            User.first_name.label("first_name"),
            User.last_name.label("last_name"),
            User.avatar_preset.label("avatar_preset"),
            User.avatar_url.label("avatar_url"),
            User.bets_profile_visibility.label("bets_profile_visibility"),
            User.show_bet_amounts.label("show_bet_amounts"),
            func.coalesce(user_fixture_stats.c.total_points, 0).label("total_points"),
            func.coalesce(user_fixture_stats.c.settled_bets, 0).label("settled_bets"),
            func.coalesce(wager_counts.c.wager_count, 0).label("wager_count"),
            func.coalesce(user_fixture_stats.c.correct_results, 0).label("correct_results"),
            func.coalesce(user_fixture_stats.c.wrong_results, 0).label("wrong_results"),
            func.coalesce(func.max(GroupMember.total_amount_bet), Decimal("0")).label("total_wagered"),
        )
        .outerjoin(user_fixture_stats, user_fixture_stats.c.stats_user_id == User.id)
        .outerjoin(wager_counts, wager_counts.c.wager_user_id == User.id)
        .outerjoin(GroupMember, GroupMember.user_id == User.id)
        .group_by(
            User.id,
            User.username,
            User.first_name,
            User.last_name,
            User.avatar_preset,
            User.avatar_url,
            User.bets_profile_visibility,
            User.show_bet_amounts,
            user_fixture_stats.c.total_points,
            user_fixture_stats.c.settled_bets,
            user_fixture_stats.c.correct_results,
            user_fixture_stats.c.wrong_results,
            wager_counts.c.wager_count,
        )
    ).subquery()


def _norm_visibility(v: str | None) -> Literal["public", "invite_only"]:
    if v == "invite_only":
        return "invite_only"
    return "public"


async def _fetch_leaderboard_page(
    db: AsyncSession,
    *,
    page: int,
    limit: int,
    sort: Literal["points", "accuracy", "bets"],
    min_bets: int,
    week_start: datetime | None = None,
) -> list[LeaderboardEntry]:
    offset = (page - 1) * limit
    min_bets = max(1, min(min_bets, 500))

    base_subq = _leaderboard_subquery(week_start=week_start)

    filtered = select(base_subq).where(base_subq.c.wager_count >= min_bets).subquery()

    acc_ratio = func.coalesce(
        cast(filtered.c.correct_results, Float) / func.nullif(cast(filtered.c.settled_bets, Float), 0),
        0.0,
    )

    if sort == "accuracy":
        order_by = (desc(acc_ratio), desc(filtered.c.total_points), desc(filtered.c.wager_count))
    elif sort == "bets":
        order_by = (desc(filtered.c.wager_count), desc(filtered.c.settled_bets), desc(filtered.c.total_points))
    else:
        order_by = (desc(filtered.c.total_points), desc(acc_ratio), desc(filtered.c.wager_count))

    stmt = select(filtered).order_by(*order_by).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    leaderboard: list[LeaderboardEntry] = []
    for idx, row in enumerate(rows):
        pos = offset + idx + 1
        settled = int(row.settled_bets or 0)
        wager = int(row.wager_count or 0)
        correct = int(row.correct_results or 0)
        wrong = int(row.wrong_results or 0)
        accuracy = round((correct / settled * 100) if settled > 0 else 0.0, 1)
        miss_pct = round((wrong / settled * 100) if settled > 0 else 0.0, 1)
        vis = _norm_visibility(getattr(row, "bets_profile_visibility", None))
        leaderboard.append(
            LeaderboardEntry(
                position=pos,
                user_id=row.user_id,
                username=row.username,
                first_name=getattr(row, "first_name", None),
                last_name=getattr(row, "last_name", None),
                avatar_preset=getattr(row, "avatar_preset", None),
                avatar_url=getattr(row, "avatar_url", None),
                avatar_display=avatar_display_path(
                    getattr(row, "avatar_preset", None),
                    getattr(row, "avatar_url", None),
                ),
                total_points=int(row.total_points or 0),
                total_bets=settled,
                correct_results=correct,
                accuracy_pct=accuracy,
                wrong_results=wrong,
                miss_pct=miss_pct,
                bets_profile_visibility=vis,
                wager_count=wager,
                show_bet_amounts=bool(getattr(row, "show_bet_amounts", True)),
                total_wagered=Decimal(str(row.total_wagered or 0)),
            )
        )
    return leaderboard


def _scoring_bet_sql_clause():
    """Bets that count toward accuracy (free/zero extras or confirmed paid extras)."""
    return and_(
        or_(Bet.amount <= 0, Bet.amount_confirmed == True),  # noqa: E712
        Bet.cancelled_at.is_(None),
    )


async def _fixture_level_bet_stats(
    db: AsyncSession,
    user_id: uuid.UUID,
    polla_bets,
    *,
    group: Group | None = None,
    phase_key: str | None = None,
) -> tuple[int, int, int, int]:
    """
    Accuracy stats per fixture (best settled bet per match), not per bet row.

    Avoids counting global free + paid extra on the same match as 2 liquidadas.
    """
    scoring = _scoring_bet_sql_clause()
    phase_cond = None
    if group and phase_key:
        from app.services.prize_structure_service import effective_phase_fixture_filter

        phase_cond = effective_phase_fixture_filter(phase_key, group)

    if phase_cond is not None:
        wager = int(
            (
                await db.execute(
                    select(func.count())
                    .select_from(Bet)
                    .join(Fixture, Bet.fixture_id == Fixture.id)
                    .where(and_(Bet.user_id == user_id, polla_bets, scoring, phase_cond))
                )
            ).scalar()
            or 0
        )
        rows = (
            await db.execute(
                select(
                    Bet.fixture_id,
                    func.max(Bet.points_earned).label("best_pts"),
                )
                .select_from(Bet)
                .join(Fixture, Bet.fixture_id == Fixture.id)
                .where(
                    and_(
                        Bet.user_id == user_id,
                        polla_bets,
                        scoring,
                        Bet.points_earned.isnot(None),
                        phase_cond,
                    )
                )
                .group_by(Bet.fixture_id)
            )
        ).all()
    else:
        wager = int(
            (
                await db.execute(
                    select(func.count()).where(and_(Bet.user_id == user_id, polla_bets, scoring))
                )
            ).scalar()
            or 0
        )
        rows = (
            await db.execute(
                select(
                    Bet.fixture_id,
                    func.max(Bet.points_earned).label("best_pts"),
                )
                .where(
                    and_(
                        Bet.user_id == user_id,
                        polla_bets,
                        scoring,
                        Bet.points_earned.isnot(None),
                    )
                )
                .group_by(Bet.fixture_id)
            )
        ).all()
    settled = len(rows)
    correct = sum(1 for row in rows if int(row.best_pts or 0) > 0)
    wrong = sum(1 for row in rows if int(row.best_pts or 0) == 0)
    return wager, settled, correct, wrong


async def _ranking_points_for_member(
    db: AsyncSession,
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    member: GroupMember,
) -> int:
    """Ranking = member.total_points (apuestas + retos). Tarjetas pueden mostrar pts del partido aunque el reto los haya absorbido."""
    return member.total_points


async def get_group_leaderboard(
    db: AsyncSession,
    group_id: uuid.UUID,
    sort: Literal["points", "accuracy", "bets"] = "points",
    min_bets: int = 1,
) -> list[LeaderboardEntry]:
    group_res = await db.execute(select(Group).where(Group.id == group_id))
    group = group_res.scalar_one_or_none()
    if not group:
        return []

    from app.services.prize_structure_service import get_effective_phases

    phase_key = group.current_phase_key or get_effective_phases(group)[0]

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
    )
    rows = result.all()

    entries: list[LeaderboardEntry] = []
    for member, user in rows:
        polla_bets = or_(Bet.group_id == group_id, Bet.group_id.is_(None))
        wager, settled, correct, wrong = await _fixture_level_bet_stats(
            db,
            user.id,
            polla_bets,
            group=group,
            phase_key=phase_key,
        )
        accuracy = round((correct / settled * 100) if settled > 0 else 0.0, 1)
        miss_pct = round((wrong / settled * 100) if settled > 0 else 0.0, 1)
        vis = _norm_visibility(user.bets_profile_visibility)
        ranking_pts = await _ranking_points_for_member(db, group_id, user.id, member)
        cstats = await compute_challenge_stats(
            db, user.id, group_id, group=group, phase_key=phase_key
        )
        bet_pts = await compute_bet_points_for_ranking(
            db, user.id, group_id, group=group, phase_key=phase_key
        )
        entries.append(
            LeaderboardEntry(
                position=0,
                user_id=user.id,
                username=user.username,
                first_name=user.first_name,
                last_name=user.last_name,
                avatar_preset=user.avatar_preset,
                avatar_url=user.avatar_url,
                avatar_display=avatar_display_path(user.avatar_preset, user.avatar_url),
                total_points=ranking_pts,
                total_bets=settled,
                correct_results=correct,
                accuracy_pct=accuracy,
                wrong_results=wrong,
                miss_pct=miss_pct,
                bets_profile_visibility=vis,
                wager_count=wager,
                show_bet_amounts=bool(getattr(user, "show_bet_amounts", True)),
                total_wagered=Decimal(str(member.total_amount_bet or 0)),
                bet_points=bet_pts,
                challenge_pts_won=cstats["challenge_pts_won"],
                challenge_pts_lost=cstats["challenge_pts_lost"],
                challenge_pts_net=cstats["challenge_pts_net"],
                challenges_won=cstats["challenges_won"],
                challenges_lost=cstats["challenges_lost"],
                challenges_active=cstats["challenges_active"],
                badges=[],
            )
        )

    if sort == "accuracy":
        entries.sort(key=lambda e: (-e.accuracy_pct, -e.total_points, -e.wager_count, e.username))
    elif sort == "bets":
        entries.sort(key=lambda e: (-e.wager_count, -e.total_bets, -e.total_points, e.username))
    else:
        entries.sort(key=lambda e: (-e.total_points, -e.accuracy_pct, -e.wager_count, e.username))

    for pos, entry in enumerate(entries, start=1):
        entry.position = pos
        raw_badges = await compute_badges(
            db, entry.user_id, group_id=group_id, position=entry.position
        )
        entry.badges = [BadgeOut(**b) for b in raw_badges[:3]]

    return entries


async def get_global_leaderboard(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    sort: Literal["points", "accuracy", "bets"] = "points",
    min_bets: int = 1,
) -> list[LeaderboardEntry]:
    """
    Ranking visible en dashboard. Usa total_points del miembro en la polla activa
    (apuestas + retos 1v1). Si no hay polla activa, cae al sumatorio de apuestas.
    """
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group = result.scalar_one_or_none()
    if group:
        full = await get_group_leaderboard(db, group.id, sort=sort, min_bets=min_bets)
        offset = (page - 1) * limit
        return full[offset : offset + limit]
    return await _fetch_leaderboard_page(db, page=page, limit=limit, sort=sort, min_bets=min_bets)


async def get_weekly_leaderboard(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    sort: Literal["points", "accuracy", "bets"] = "points",
    min_bets: int = 1,
    *,
    week_start: datetime,
) -> list[LeaderboardEntry]:
    return await _fetch_leaderboard_page(
        db, page=page, limit=limit, sort=sort, min_bets=min_bets, week_start=week_start
    )
