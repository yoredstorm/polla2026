"""1v1 challenge (Te reto) — stake ranking points on a single fixture."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, and_, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.models.bet import Bet
from app.models.challenge import Challenge
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.audit import log_action
from app.services.notification_service import create_notification, broadcast_event

DEFAULT_MAX_STAKE = 10
MIN_STAKE = 1
# Backward compatibility for imports
MAX_STAKE = DEFAULT_MAX_STAKE


def max_stake_by_balance(available: int) -> int:
    """Max 50% of available ranking points per duel."""
    return max(MIN_STAKE, available // 2)


async def get_challenge_max_stake(db: AsyncSession, group: Group) -> int:
    val = getattr(group, "challenge_max_stake", None) or DEFAULT_MAX_STAKE
    return max(MIN_STAKE, min(20, int(val)))


async def effective_max_stake_for_user(
    db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID
) -> int:
    avail = await available_points(db, user_id, group_id)
    group_res = await db.execute(select(Group).where(Group.id == group_id))
    group = group_res.scalar_one_or_none()
    if not group:
        return 0
    cap = await get_challenge_max_stake(db, group)
    return max(0, min(avail, cap, max_stake_by_balance(avail)))


def _validate_stake_amount(
    stake_points: int,
    *,
    group_max: int,
    challenger_avail: int,
    challenged_avail: int,
) -> None:
    if stake_points < MIN_STAKE:
        raise ValueError("INVALID_STAKE")
    ch_cap = min(group_max, max_stake_by_balance(challenger_avail), challenger_avail)
    if stake_points > ch_cap:
        if stake_points > group_max:
            raise ValueError("STAKE_ABOVE_MAX")
        if stake_points > max_stake_by_balance(challenger_avail):
            raise ValueError("STAKE_ABOVE_HALF_BALANCE")
        raise ValueError("INSUFFICIENT_POINTS")
    op_cap = min(group_max, max_stake_by_balance(challenged_avail), challenged_avail)
    if stake_points > op_cap:
        if stake_points > group_max:
            raise ValueError("STAKE_ABOVE_MAX")
        raise ValueError("OPPONENT_INSUFFICIENT_POINTS")


async def _get_active_group(db: AsyncSession) -> Group | None:
    result = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    return result.scalar_one_or_none()


async def _committed_stakes(db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID) -> int:
    """Active stakes count for both sides; pending only reserves the challenger."""
    active_q = select(func.coalesce(func.sum(Challenge.stake_points), 0)).where(
        Challenge.group_id == group_id,
        Challenge.status == "active",
        or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
    )
    pending_q = select(func.coalesce(func.sum(Challenge.stake_points), 0)).where(
        Challenge.group_id == group_id,
        Challenge.status == "pending_accept",
        Challenge.challenger_id == user_id,
    )
    active = int((await db.execute(active_q)).scalar() or 0)
    pending = int((await db.execute(pending_q)).scalar() or 0)
    return active + pending


async def available_points(db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID) -> int:
    member_res = await db.execute(
        select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id))
    )
    member = member_res.scalar_one_or_none()
    if not member:
        return 0
    committed = await _committed_stakes(db, user_id, group_id)
    return max(0, member.total_points - committed)


async def user_has_active_challenge_on_fixture(
    db: AsyncSession, user_id: uuid.UUID, fixture_id: uuid.UUID
) -> bool:
    res = await db.execute(
        select(Challenge.id).where(
            Challenge.fixture_id == fixture_id,
            Challenge.status == "active",
            or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
        ).limit(1)
    )
    return res.scalar_one_or_none() is not None


async def _assert_bet_on_fixture(db: AsyncSession, user_id: uuid.UUID, fixture_id: uuid.UUID) -> Bet:
    res = await db.execute(
        select(Bet).where(and_(Bet.user_id == user_id, Bet.fixture_id == fixture_id))
    )
    bet = res.scalar_one_or_none()
    if not bet:
        raise ValueError("BOTH_NEED_BET")
    return bet


async def create_challenge(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    challenger_id: uuid.UUID,
    challenged_username: str,
    fixture_id: uuid.UUID,
    stake_points: int,
    ip: str | None,
) -> Challenge:
    group = await _get_active_group(db)
    if not group:
        raise ValueError("NO_ACTIVE_POLLA")

    fixture_res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = fixture_res.scalar_one_or_none()
    if not fixture or fixture.is_locked or fixture.status != "scheduled" or not fixture.betting_open:
        raise ValueError("FIXTURE_NOT_OPEN")

    challenged_res = await db.execute(select(User).where(User.username == challenged_username))
    challenged = challenged_res.scalar_one_or_none()
    if not challenged or not challenged.is_active:
        raise ValueError("USER_NOT_FOUND")
    if challenged.id == challenger_id:
        raise ValueError("CANNOT_CHALLENGE_SELF")

    for uid in (challenger_id, challenged.id):
        m = await db.execute(
            select(GroupMember).where(and_(GroupMember.group_id == group.id, GroupMember.user_id == uid))
        )
        if not m.scalar_one_or_none():
            raise ValueError("NOT_POLLA_MEMBER")

    await _assert_bet_on_fixture(db, challenger_id, fixture_id)

    challenged_member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == challenged.id)
        )
    )
    challenged_member = challenged_member_res.scalar_one_or_none()
    if not challenged_member:
        raise ValueError("NOT_POLLA_MEMBER")

    challenger_avail = await available_points(db, challenger_id, group.id)
    challenged_avail = await available_points(db, challenged.id, group.id)
    group_max = await get_challenge_max_stake(db, group)
    _validate_stake_amount(
        stake_points,
        group_max=group_max,
        challenger_avail=challenger_avail,
        challenged_avail=challenged_avail,
    )

    dup = await db.execute(
        select(Challenge).where(
            Challenge.fixture_id == fixture_id,
            Challenge.status.in_(("pending_accept", "active")),
            or_(
                and_(Challenge.challenger_id == challenger_id, Challenge.challenged_id == challenged.id),
                and_(Challenge.challenger_id == challenged.id, Challenge.challenged_id == challenger_id),
            ),
        )
    )
    if dup.scalar_one_or_none():
        raise ValueError("CHALLENGE_EXISTS")

    challenger_user = await db.get(User, challenger_id)
    ch = Challenge(
        fixture_id=fixture_id,
        group_id=group.id,
        challenger_id=challenger_id,
        challenged_id=challenged.id,
        stake_points=stake_points,
        status="pending_accept",
    )
    db.add(ch)
    await db.flush()
    await db.refresh(ch)

    await log_action(
        db,
        user_id=challenger_id,
        action="challenge_created",
        detail={
            "challenge_id": str(ch.id),
            "fixture_id": str(fixture_id),
            "stake": stake_points,
            "stake_points": stake_points,
            "challenged_username": challenged.username,
            "challenged_id": str(challenged.id),
        },
        ip=ip,
    )

    if redis and challenger_user:
        await create_notification(
            db,
            redis,
            user_id=challenged.id,
            type="challenge_received",
            title=f"@{challenger_user.username} te reta",
            body=f"Partido {fixture.home_team} vs {fixture.away_team} — apuesta: {stake_points} pts",
            payload={"challenge_id": str(ch.id), "fixture_id": str(fixture_id), "stake": stake_points},
        )

    return ch


async def accept_challenge(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    challenge_id: uuid.UUID,
    user_id: uuid.UUID,
    ip: str | None,
) -> Challenge:
    res = await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    ch = res.scalar_one_or_none()
    if not ch or ch.challenged_id != user_id:
        raise ValueError("NOT_FOUND")
    if ch.status != "pending_accept":
        raise ValueError("INVALID_STATUS")

    fixture_res = await db.execute(select(Fixture).where(Fixture.id == ch.fixture_id))
    fixture = fixture_res.scalar_one_or_none()
    if not fixture or fixture.is_locked:
        raise ValueError("FIXTURE_LOCKED")

    challenger_member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == ch.group_id, GroupMember.user_id == ch.challenger_id)
        )
    )
    challenger_member = challenger_member_res.scalar_one_or_none()
    if not challenger_member or challenger_member.total_points < ch.stake_points:
        raise ValueError("INSUFFICIENT_POINTS")

    challenged_avail = await available_points(db, ch.challenged_id, ch.group_id)
    if challenged_avail < ch.stake_points:
        raise ValueError("INSUFFICIENT_POINTS")

    for uid in (ch.challenger_id, ch.challenged_id):
        await _assert_bet_on_fixture(db, uid, ch.fixture_id)

    for uid in (ch.challenger_id, ch.challenged_id):
        member_res = await db.execute(
            select(GroupMember).where(and_(GroupMember.group_id == ch.group_id, GroupMember.user_id == uid))
        )
        member = member_res.scalar_one_or_none()
        if member:
            member.total_points -= ch.stake_points

    ch.status = "active"
    ch.accepted_at = datetime.now(timezone.utc)
    await db.flush()

    challenger = await db.get(User, ch.challenger_id)
    challenged = await db.get(User, ch.challenged_id)
    await log_action(
        db,
        user_id=user_id,
        action="challenge_accepted",
        detail={"challenge_id": str(ch.id), "stake": ch.stake_points},
        ip=ip,
    )

    if redis and challenged and challenger:
        await create_notification(
            db,
            redis,
            user_id=ch.challenger_id,
            type="challenge_accepted",
            title=f"@{challenged.username} acepto tu reto",
            body=f"En juego: {ch.stake_points} pts cada uno",
            payload={"challenge_id": str(ch.id)},
        )

    return ch


async def reject_challenge(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    *,
    challenge_id: uuid.UUID,
    user_id: uuid.UUID,
    ip: str | None,
) -> Challenge:
    res = await db.execute(select(Challenge).where(Challenge.id == challenge_id))
    ch = res.scalar_one_or_none()
    if not ch or ch.challenged_id != user_id:
        raise ValueError("NOT_FOUND")
    if ch.status != "pending_accept":
        raise ValueError("INVALID_STATUS")

    ch.status = "rejected"
    await db.flush()
    await log_action(
        db,
        user_id=user_id,
        action="challenge_rejected",
        detail={"challenge_id": str(ch.id)},
        ip=ip,
    )

    if redis:
        challenger = await db.get(User, ch.challenger_id)
        challenged = await db.get(User, ch.challenged_id)
        if challenger and challenged:
            await create_notification(
                db,
                redis,
                user_id=ch.challenger_id,
                type="challenge_rejected",
                title=f"@{challenged.username} rechazo tu reto",
                body="Puedes crear otro reto en un partido distinto.",
                payload={"challenge_id": str(ch.id)},
            )
    return ch


async def settle_challenges_for_fixture(db: AsyncSession, redis: aioredis.Redis | None, fixture: Fixture) -> int:
    if fixture.status != "finished":
        return 0

    res = await db.execute(
        select(Challenge).where(and_(Challenge.fixture_id == fixture.id, Challenge.status == "active"))
    )
    challenges = res.scalars().all()
    settled = 0

    for ch in challenges:
        c_bet_res = await db.execute(
            select(Bet).where(and_(Bet.user_id == ch.challenger_id, Bet.fixture_id == fixture.id))
        )
        d_bet_res = await db.execute(
            select(Bet).where(and_(Bet.user_id == ch.challenged_id, Bet.fixture_id == fixture.id))
        )
        c_bet = c_bet_res.scalar_one_or_none()
        d_bet = d_bet_res.scalar_one_or_none()

        ch.challenger_fixture_points = c_bet.points_earned if c_bet and c_bet.points_earned is not None else 0
        ch.challenged_fixture_points = d_bet.points_earned if d_bet and d_bet.points_earned is not None else 0

        c_pts = ch.challenger_fixture_points
        d_pts = ch.challenged_fixture_points
        stake = ch.stake_points

        async def _member(uid: uuid.UUID) -> GroupMember | None:
            r = await db.execute(
                select(GroupMember).where(and_(GroupMember.group_id == ch.group_id, GroupMember.user_id == uid))
            )
            return r.scalar_one_or_none()

        challenger_m = await _member(ch.challenger_id)
        challenged_m = await _member(ch.challenged_id)

        if c_bet is None and d_bet is None:
            ch.status = "cancelled"
        elif c_bet is None:
            ch.winner_id = ch.challenged_id
            if challenged_m:
                challenged_m.total_points += 2 * stake
        elif d_bet is None:
            ch.winner_id = ch.challenger_id
            if challenger_m:
                challenger_m.total_points += 2 * stake
        elif c_pts > d_pts:
            ch.winner_id = ch.challenger_id
            if challenger_m:
                challenger_m.total_points += 2 * stake + c_pts
        elif d_pts > c_pts:
            ch.winner_id = ch.challenged_id
            if challenged_m:
                challenged_m.total_points += 2 * stake + d_pts
        else:
            ch.winner_id = None
            if challenger_m:
                challenger_m.total_points += stake + c_pts
            if challenged_m:
                challenged_m.total_points += stake + d_pts

        # Loser must not keep fixture bet points on ranking (stake already lost at accept).
        if ch.winner_id:
            loser_id = ch.challenged_id if ch.winner_id == ch.challenger_id else ch.challenger_id
            loser_pts = d_pts if loser_id == ch.challenged_id else c_pts
            loser_m = await _member(loser_id)
            if loser_m and loser_pts > 0:
                loser_m.total_points = max(0, loser_m.total_points - loser_pts)

        ch.status = "settled"
        ch.settled_at = datetime.now(timezone.utc)
        settled += 1

        challenger_u = await db.get(User, ch.challenger_id)
        challenged_u = await db.get(User, ch.challenged_id)
        await log_action(
            db,
            user_id=None,
            action="challenge_settled",
            detail={
                "challenge_id": str(ch.id),
                "fixture_id": str(ch.fixture_id),
                "winner_id": str(ch.winner_id) if ch.winner_id else None,
                "challenger_points": c_pts,
                "challenged_points": d_pts,
                "stake": stake,
                "challenger_username": challenger_u.username if challenger_u else None,
                "challenged_username": challenged_u.username if challenged_u else None,
            },
            ip=None,
        )

        if redis:
            for uid in (ch.challenger_id, ch.challenged_id):
                won = ch.winner_id == uid
                tie = ch.winner_id is None
                title = "Reto: empate" if tie else ("Reto ganado" if won else "Reto perdido")
                body = f"Resultado {c_pts}-{d_pts} en el partido. "
                if tie:
                    body += "Puntos devueltos."
                elif won:
                    body += f"Ganaste {stake} pts del rival."
                else:
                    body += f"Perdiste {stake} pts."
                await create_notification(
                    db,
                    redis,
                    user_id=uid,
                    type="challenge_resolved",
                    title=title,
                    body=body,
                    payload={"challenge_id": str(ch.id), "winner_id": str(ch.winner_id) if ch.winner_id else None},
                )

            await log_action(
                db,
                user_id=None,
                action="challenge_points_transferred",
                detail={"challenge_id": str(ch.id), "stake": stake},
                ip=None,
            )

    if settled and redis:
        await broadcast_event(db, redis, {"type": "data_refresh", "data": {"reason": "challenges_settled"}})

    await db.flush()
    return settled


async def repair_settled_challenge_loser_points(db: AsyncSession, group_id: uuid.UUID) -> int:
    """
    One-time fix: remove fixture bet points wrongly kept by challenge losers (pre-defer fix).
    Safe to run multiple times (idempotent when loser has no extra pts).
    """
    res = await db.execute(
        select(Challenge).where(
            Challenge.group_id == group_id,
            Challenge.status == "settled",
            Challenge.winner_id.isnot(None),  # noqa: E711
        )
    )
    repaired = 0
    for ch in res.scalars().all():
        loser_id = ch.challenged_id if ch.winner_id == ch.challenger_id else ch.challenger_id
        loser_pts = (
            ch.challenged_fixture_points
            if loser_id == ch.challenged_id
            else ch.challenger_fixture_points
        )
        if not loser_pts or loser_pts <= 0:
            continue
        m_res = await db.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == group_id, GroupMember.user_id == loser_id)
            )
        )
        member = m_res.scalar_one_or_none()
        if member:
            before = member.total_points
            member.total_points = max(0, member.total_points - loser_pts)
            if member.total_points != before:
                repaired += 1
    if repaired:
        await db.flush()
    return repaired


def ranking_delta_for_user(ch: Challenge, user_id: uuid.UUID) -> int | None:
    """
    Net ranking points gained/lost from this duel vs state before accept.
    None if not yet settled (or no point movement to show).
    """
    if ch.status == "rejected" or ch.status == "cancelled":
        return 0
    if ch.status not in ("settled",):
        return None

    stake = ch.stake_points
    is_challenger = ch.challenger_id == user_id
    my_pts = ch.challenger_fixture_points if is_challenger else ch.challenged_fixture_points
    my_pts = int(my_pts or 0)

    if ch.winner_id == user_id:
        return stake + my_pts
    if ch.winner_id is None:
        return my_pts
    return -(stake + my_pts)


def duel_result_for_user(ch: Challenge, user_id: uuid.UUID) -> str:
    if ch.status == "pending_accept":
        return "pending"
    if ch.status == "active":
        return "active"
    if ch.status == "rejected":
        return "rejected"
    if ch.status == "cancelled":
        return "cancelled"
    if ch.status != "settled":
        return ch.status
    if ch.winner_id == user_id:
        return "won"
    if ch.winner_id is None:
        return "draw"
    return "lost"


async def compute_challenge_stats(
    db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID
) -> dict[str, int]:
    res = await db.execute(
        select(Challenge).where(
            Challenge.group_id == group_id,
            or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
        )
    )
    won = lost = active = 0
    pts_won = pts_lost = 0
    for ch in res.scalars().all():
        if ch.status == "active":
            active += 1
            continue
        if ch.status != "settled":
            continue
        if ch.winner_id == user_id:
            won += 1
            pts_won += ch.stake_points
        elif ch.winner_id is not None:
            lost += 1
            pts_lost += ch.stake_points
    return {
        "challenges_won": won,
        "challenges_lost": lost,
        "challenges_active": active,
        "challenge_pts_won": pts_won,
        "challenge_pts_lost": pts_lost,
        "challenge_pts_net": pts_won - pts_lost,
    }


async def compute_bet_points_for_ranking(
    db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID
) -> int:
    """Sum fixture bet points that count toward ranking (excludes loser pts on challenge fixtures)."""
    polla_bets = or_(Bet.group_id == group_id, Bet.group_id.is_(None))
    bets_res = await db.execute(
        select(Bet).where(
            Bet.user_id == user_id,
            polla_bets,
            Bet.points_earned.isnot(None),
        )
    )
    bets = bets_res.scalars().all()
    lost_fixture_ids: set[uuid.UUID] = set()
    ch_res = await db.execute(
        select(Challenge).where(
            Challenge.group_id == group_id,
            Challenge.status == "settled",
            Challenge.winner_id.isnot(None),  # noqa: E711
            or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
        )
    )
    for ch in ch_res.scalars().all():
        if ch.winner_id != user_id:
            lost_fixture_ids.add(ch.fixture_id)
    total = 0
    for bet in bets:
        if bet.fixture_id in lost_fixture_ids:
            continue
        total += bet.points_earned or 0
    return total


async def search_challenge_opponents(
    db: AsyncSession,
    user_id: uuid.UUID,
    q: str,
    limit: int = 10,
) -> list[dict[str, int | str]]:
    group = await _get_active_group(db)
    if not group:
        return []
    term = q.strip()
    if len(term) < 2:
        return []

    pattern = f"%{term}%"
    from sqlalchemy import or_

    res = await db.execute(
        select(User.id, User.username, User.first_name, User.last_name, GroupMember.total_points)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(
            GroupMember.group_id == group.id,
            User.id != user_id,
            User.is_active == True,  # noqa: E712
            or_(
                User.username.ilike(pattern),
                User.first_name.ilike(pattern),
                User.last_name.ilike(pattern),
            ),
        )
        .limit(min(limit, 20))
    )
    out: list[dict[str, int | str]] = []
    for uid, username, first_name, last_name, total_points in res.all():
        avail = await available_points(db, uid, group.id)
        out.append(
            {
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
                "total_points": int(total_points or 0),
                "available_for_challenge": avail,
            }
        )
    return out


async def get_h2h_stats(
    db: AsyncSession,
    user_id: uuid.UUID,
    opponent_id: uuid.UUID,
    *,
    group_id: uuid.UUID | None = None,
) -> dict:
    """Head-to-head record between two users in settled challenges."""
    group = await db.get(Group, group_id) if group_id else await _get_active_group(db)
    if not group:
        return {
            "opponent_id": str(opponent_id),
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "total_duels": 0,
        }

    res = await db.execute(
        select(Challenge).where(
            Challenge.group_id == group.id,
            Challenge.status == "settled",
            or_(
                and_(Challenge.challenger_id == user_id, Challenge.challenged_id == opponent_id),
                and_(Challenge.challenger_id == opponent_id, Challenge.challenged_id == user_id),
            ),
        )
    )
    wins = losses = draws = 0
    for ch in res.scalars().all():
        if ch.winner_id is None:
            draws += 1
        elif ch.winner_id == user_id:
            wins += 1
        else:
            losses += 1
    opp = await db.get(User, opponent_id)
    return {
        "opponent_id": str(opponent_id),
        "opponent_username": opp.username if opp else None,
        "opponent_first_name": opp.first_name if opp else None,
        "opponent_last_name": opp.last_name if opp else None,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "total_duels": wins + losses + draws,
    }


async def get_primary_rival(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    group_id: uuid.UUID | None = None,
) -> dict | None:
    """Opponent with the most settled duels against the user."""
    group = await db.get(Group, group_id) if group_id else await _get_active_group(db)
    if not group:
        return None

    res = await db.execute(
        select(Challenge).where(
            Challenge.group_id == group.id,
            Challenge.status == "settled",
            or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
        )
    )
    counts: dict[uuid.UUID, int] = {}
    for ch in res.scalars().all():
        oid = ch.challenged_id if ch.challenger_id == user_id else ch.challenger_id
        counts[oid] = counts.get(oid, 0) + 1
    if not counts:
        return None
    opponent_id = max(counts, key=counts.get)  # type: ignore[arg-type]
    h2h = await get_h2h_stats(db, user_id, opponent_id, group_id=group.id)
    return {**h2h, "duels_together": counts[opponent_id]}
