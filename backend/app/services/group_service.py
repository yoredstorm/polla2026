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
from app.models.bet import Bet
from app.models.user import User
from app.schemas.group import GroupCreate, LeaderboardEntry, BadgeOut
from app.services.avatar_service import avatar_display_path
from app.services.challenge_service import compute_challenge_stats, compute_bet_points_for_ranking
from app.services.gamification_service import compute_badges

logger = structlog.get_logger(__name__)


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

    # Add entry fee to prize pool
    group.prize_pool += data.entry_fee
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
    group.prize_pool += group.entry_fee
    await db.flush()
    await db.refresh(group)
    return group


def _leaderboard_subquery(*, week_start: datetime | None = None):
    cond = []
    if week_start is not None:
        cond.append(Bet.created_at >= week_start)
    where_clause = and_(*cond) if cond else True
    return (
        select(
            User.id.label("user_id"),
            User.username.label("username"),
            User.avatar_preset.label("avatar_preset"),
            User.avatar_url.label("avatar_url"),
            User.bets_profile_visibility.label("bets_profile_visibility"),
            User.show_bet_amounts.label("show_bet_amounts"),
            func.coalesce(func.sum(Bet.points_earned), 0).label("total_points"),
            func.count(Bet.id).filter(Bet.points_earned.isnot(None)).label("settled_bets"),
            func.count(Bet.id).label("wager_count"),
            func.count(Bet.id).filter(Bet.points_earned > 0).label("correct_results"),
            func.count(Bet.id)
            .filter(and_(Bet.points_earned.isnot(None), Bet.points_earned == 0))
            .label("wrong_results"),
            # Total amount this user has contributed (entry fee + confirmed extras)
            func.coalesce(func.max(GroupMember.total_amount_bet), Decimal("0")).label("total_wagered"),
        )
        .join(Bet, Bet.user_id == User.id)
        .outerjoin(GroupMember, GroupMember.user_id == User.id)
        .where(where_clause)
        .group_by(
            User.id,
            User.username,
            User.avatar_preset,
            User.avatar_url,
            User.bets_profile_visibility,
            User.show_bet_amounts,
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
    min_bets = max(1, min(min_bets, 500))
    result = await db.execute(
        select(GroupMember, User)
        .join(User, GroupMember.user_id == User.id)
        .where(GroupMember.group_id == group_id)
    )
    rows = result.all()

    entries: list[LeaderboardEntry] = []
    for member, user in rows:
        polla_bets = or_(Bet.group_id == group_id, Bet.group_id.is_(None))
        bets_result = await db.execute(
            select(
                func.count().label("wager_count"),
                func.count().filter(Bet.points_earned.isnot(None)).label("settled"),
                func.count().filter(Bet.points_earned > 0).label("correct"),
                func.count()
                .filter(and_(Bet.points_earned.isnot(None), Bet.points_earned == 0))
                .label("wrong"),
            ).where(and_(Bet.user_id == user.id, polla_bets))
        )
        br = bets_result.one()
        wager = int(br.wager_count or 0)
        settled = int(br.settled or 0)
        correct = int(br.correct or 0)
        wrong = int(br.wrong or 0)
        if wager < min_bets:
            continue
        accuracy = round((correct / settled * 100) if settled > 0 else 0.0, 1)
        miss_pct = round((wrong / settled * 100) if settled > 0 else 0.0, 1)
        vis = _norm_visibility(user.bets_profile_visibility)
        ranking_pts = await _ranking_points_for_member(db, group_id, user.id, member)
        cstats = await compute_challenge_stats(db, user.id, group_id)
        bet_pts = await compute_bet_points_for_ranking(db, user.id, group_id)
        entries.append(
            LeaderboardEntry(
                position=0,
                user_id=user.id,
                username=user.username,
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
