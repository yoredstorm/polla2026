"""
Bet service — scoring logic, locking rules, prize distribution.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_

if TYPE_CHECKING:
    import redis.asyncio as aioredis

from app.core.match_timing import (
    can_create_change_request_for_fixture,
    can_resolve_change_request_for_fixture,
    should_lock_fixture,
)
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.user import User
from app.services.audit import log_action
from app.services.challenge_service import user_has_active_challenge_on_fixture
from app.schemas.bet import BetCreate
import structlog

# Re-export for existing imports
__all__ = [
    "calculate_points",
    "is_fixture_bettable",
    "should_lock_fixture",
    "can_create_change_request_for_fixture",
    "can_resolve_change_request_for_fixture",
    "assert_unique_prediction_for_fixture",
    "create_bet",
    "settle_fixture_bets",
    "settle_single_bet",
    "bet_eligible_for_scoring",
    "is_unpaid_extra",
    "is_bet_active",
    "cancel_unpaid_extras_for_fixture",
    "repair_unpaid_extra_cancellations",
    "get_scoring_bet_for_fixture",
    "repair_unconfirmed_extra_settlement",
    "SettleResult",
    "allocate_first_place_prizes",
]

logger = structlog.get_logger(__name__)


def _winner(h: int, a: int) -> str:
    if h > a:
        return "home"
    elif a > h:
        return "away"
    return "draw"


def calculate_points(
    predicted_home: int,
    predicted_away: int,
    real_home: int,
    real_away: int,
) -> int:
    """
    Scoring rules:
    - Exact score (goals + winner): 2 points
    - Correct winner only (home/away/draw): 1 point
    - Wrong: 0 points
    """
    if predicted_home == real_home and predicted_away == real_away:
        return 2
    if _winner(predicted_home, predicted_away) == _winner(real_home, real_away):
        return 1
    return 0


@dataclass
class SettleResult:
    settled_count: int
    skipped_unconfirmed_extras: int


def is_unpaid_extra(bet: Bet) -> bool:
    return bet.group_id is not None and bet.amount > 0 and not bet.amount_confirmed


def is_bet_active(bet: Bet) -> bool:
    return bet.cancelled_at is None


def bet_eligible_for_scoring(bet: Bet) -> bool:
    """Free bets and zero-amount extras always count; paid extras require admin confirmation."""
    if not is_bet_active(bet):
        return False
    if bet.amount is None or bet.amount <= 0:
        return True
    return bet.amount_confirmed


async def cancel_unpaid_extras_for_fixture(
    db: AsyncSession,
    fixture: Fixture,
    *,
    reason: str,
    redis: "aioredis.Redis | None" = None,
) -> int:
    """Cancel unpaid extras when betting closes; log per user and resolve admin notifications."""
    from app.services.notification_service import resolve_actionable_notifications

    result = await db.execute(
        select(Bet, User)
        .join(User, Bet.user_id == User.id)
        .where(
            and_(
                Bet.fixture_id == fixture.id,
                Bet.group_id.isnot(None),
                Bet.amount > 0,
                Bet.amount_confirmed == False,  # noqa: E712
                Bet.cancelled_at.is_(None),
            )
        )
    )
    rows = result.all()
    now = datetime.now(timezone.utc)
    cancelled = 0
    for bet, user in rows:
        bet.cancelled_at = now
        await log_action(
            db,
            user_id=bet.user_id,
            action="extra_bet_cancelled_unpaid",
            detail={
                "bet_id": str(bet.id),
                "group_id": str(bet.group_id),
                "fixture_id": str(fixture.id),
                "home_team": fixture.home_team,
                "away_team": fixture.away_team,
                "amount": str(bet.amount),
                "username": user.username,
                "reason": reason,
            },
            ip=None,
        )
        await resolve_actionable_notifications(
            db,
            redis,
            notification_type="extra_bet_pending",
            payload_match={"group_id": str(bet.group_id), "bet_id": str(bet.id)},
        )
        cancelled += 1
    if cancelled:
        await db.flush()
        logger.info(
            "unpaid_extras_cancelled",
            fixture_id=str(fixture.id),
            count=cancelled,
            reason=reason,
        )
    return cancelled


async def _audit_log_exists_for_cancelled_bet(db: AsyncSession, bet_id: uuid.UUID) -> bool:
    from app.models.audit_log import AuditLog

    bid = str(bet_id)
    res = await db.execute(
        select(AuditLog.id)
        .where(
            AuditLog.action == "extra_bet_cancelled_unpaid",
            AuditLog.detail.contains(bid),
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def repair_unpaid_extra_cancellations(db: AsyncSession) -> dict[str, int]:
    """
    Cancel unpaid extras on closed fixtures and backfill audit rows
    for bets already marked cancelled_at (e.g. migration backfill without log).
    """
    fx_res = await db.execute(
        select(Fixture).where(
            or_(
                Fixture.is_locked == True,  # noqa: E712
                Fixture.betting_open == False,  # noqa: E712
                Fixture.status != "scheduled",
            )
        )
    )
    cancelled = 0
    for fixture in fx_res.scalars().all():
        cancelled += await cancel_unpaid_extras_for_fixture(db, fixture, reason="repair")

    audit_backfilled = 0
    rows = (
        await db.execute(
            select(Bet, User, Fixture)
            .join(User, Bet.user_id == User.id)
            .join(Fixture, Bet.fixture_id == Fixture.id)
            .where(
                Bet.cancelled_at.isnot(None),
                Bet.group_id.isnot(None),
                Bet.amount > 0,
                Bet.amount_confirmed == False,  # noqa: E712
            )
        )
    ).all()
    for bet, user, fixture in rows:
        if await _audit_log_exists_for_cancelled_bet(db, bet.id):
            continue
        await log_action(
            db,
            user_id=bet.user_id,
            action="extra_bet_cancelled_unpaid",
            detail={
                "bet_id": str(bet.id),
                "group_id": str(bet.group_id),
                "fixture_id": str(fixture.id),
                "home_team": fixture.home_team,
                "away_team": fixture.away_team,
                "amount": str(bet.amount),
                "username": user.username,
                "reason": "repair_audit_backfill",
            },
            ip=None,
        )
        audit_backfilled += 1
    if cancelled or audit_backfilled:
        await db.flush()
    return {"cancelled": cancelled, "audit_backfilled": audit_backfilled}


def is_fixture_bettable(fixture: Fixture) -> bool:
    """A fixture is bettable if it's not locked, scheduled, and admin has opened betting."""
    return not fixture.is_locked and fixture.status == "scheduled" and fixture.betting_open


async def assert_unique_prediction_for_fixture(
    db: AsyncSession,
    user_id: uuid.UUID,
    fixture_id: uuid.UUID,
    predicted_home: int,
    predicted_away: int,
    *,
    exclude_bet_id: uuid.UUID | None = None,
) -> None:
    """Reject duplicate (home, away) among active bets for the same user and fixture."""
    result = await db.execute(
        select(Bet).where(
            and_(
                Bet.user_id == user_id,
                Bet.fixture_id == fixture_id,
                Bet.cancelled_at.is_(None),
            )
        )
    )
    for existing in result.scalars().all():
        if exclude_bet_id and existing.id == exclude_bet_id:
            continue
        if (
            existing.predicted_home_score == predicted_home
            and existing.predicted_away_score == predicted_away
        ):
            raise ValueError("DUPLICATE_PREDICTION_SCORE")


async def create_bet(
    db: AsyncSession,
    user_id: uuid.UUID,
    data: BetCreate,
) -> Bet:
    # Fetch fixture
    result = await db.execute(select(Fixture).where(Fixture.id == data.fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise ValueError("FIXTURE_NOT_FOUND")

    # Auto-lock check (closes betting + audit snapshot)
    if should_lock_fixture(fixture) and (fixture.betting_open or not fixture.is_locked):
        from app.services.betting_close_service import close_fixture_betting_if_due

        await close_fixture_betting_if_due(db, fixture)

    if not is_fixture_bettable(fixture):
        raise ValueError("BET_LOCKED")

    # ONE free prediction per user per fixture (group_id NULL is not unique-safe in Postgres)
    if not data.group_id:
        existing_free = await db.execute(
            select(Bet).where(
                and_(Bet.user_id == user_id, Bet.fixture_id == data.fixture_id, Bet.group_id == None)
            )
        )
        if existing_free.scalar_one_or_none():
            raise ValueError("BET_ALREADY_EXISTS")

    # Betting always requires an active polla, and the user must be a confirmed member
    polla_res = await db.execute(
        select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)
    )
    active_polla = polla_res.scalar_one_or_none()
    if not active_polla:
        raise ValueError("NO_ACTIVE_POLLA")
    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == active_polla.id, GroupMember.user_id == user_id)
        )
    )
    if not member_res.scalar_one_or_none():
        raise ValueError("NOT_POLLA_MEMBER")

    from app.services.prize_structure_service import fixture_effective_phase_key
    from app.services.phase_enrollment_service import get_enrollment, get_phase_fee

    fixture_phase = fixture_effective_phase_key(fixture, active_polla)
    active_phase = active_polla.current_phase_key or "groups"
    if not fixture_phase or fixture_phase != active_phase:
        raise ValueError("PHASE_MISMATCH")
    enrollment = await get_enrollment(db, active_polla.id, user_id, active_phase)
    if not enrollment or enrollment.status != "confirmed":
        raise ValueError("PHASE_NOT_ENROLLED")

    phase_fee_row = await get_phase_fee(db, active_polla.id, active_phase)

    # Resolve the effective amount for this bet
    effective_amount = data.amount or Decimal("0")

    if data.group_id:
        # Verify user is member of the group
        member = await db.execute(
            select(GroupMember).where(
                and_(GroupMember.group_id == data.group_id, GroupMember.user_id == user_id)
            )
        )
        if not member.scalar_one_or_none():
            raise ValueError("NOT_GROUP_MEMBER")

        # Load group to determine bet amount mode
        group_result = await db.execute(select(Group).where(Group.id == data.group_id))
        group = group_result.scalar_one_or_none()
        if group:
            phase_extra = (
                phase_fee_row.extra_per_match
                if phase_fee_row and phase_fee_row.extra_per_match
                else group.fixed_bet_amount
            )
            if group.bet_amount_mode == "single_entry":
                if data.amount and data.amount > 0 and phase_extra and phase_extra > 0:
                    effective_amount = phase_extra
                else:
                    effective_amount = Decimal("0")
            elif group.bet_amount_mode == "per_bet" and phase_extra is not None:
                effective_amount = phase_extra

    # Extra amounts require admin confirmation before they count toward the prize pool.
    # Bets without a group or with amount=0 are auto-confirmed (nothing to collect).
    extra_needs_confirmation = bool(data.group_id and effective_amount > 0)

    await assert_unique_prediction_for_fixture(
        db,
        user_id,
        data.fixture_id,
        data.predicted_home_score,
        data.predicted_away_score,
    )

    bet = Bet(
        user_id=user_id,
        fixture_id=data.fixture_id,
        group_id=data.group_id,
        predicted_home_score=data.predicted_home_score,
        predicted_away_score=data.predicted_away_score,
        amount=effective_amount,
        amount_confirmed=not extra_needs_confirmation,
        is_locked=True,
    )
    db.add(bet)
    await db.flush()
    await db.refresh(bet)
    return bet


async def _resolve_target_group_id(db: AsyncSession, bet: Bet) -> uuid.UUID | None:
    target_group_id = bet.group_id
    if not target_group_id:
        polla_res = await db.execute(
            select(Group).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
        )
        polla = polla_res.scalar_one_or_none()
        if polla:
            target_group_id = polla.id
    return target_group_id


async def _apply_settled_points_to_member(
    db: AsyncSession,
    bet: Bet,
    fixture: Fixture,
    pts: int,
) -> None:
    target_group_id = await _resolve_target_group_id(db, bet)
    if not target_group_id:
        return
    if await user_has_active_challenge_on_fixture(db, bet.user_id, fixture.id):
        return
    member_result = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == target_group_id, GroupMember.user_id == bet.user_id)
        )
    )
    member = member_result.scalar_one_or_none()
    if member:
        member.total_points += pts


async def settle_single_bet(db: AsyncSession, bet: Bet, fixture: Fixture) -> bool:
    """
    Settle one bet if eligible and fixture is finished with scores.
    Returns True if points were assigned, False if skipped or already settled.
    """
    if fixture.status != "finished" or fixture.home_score is None or fixture.away_score is None:
        return False
    if bet.points_earned is not None:
        return False
    if not bet_eligible_for_scoring(bet):
        return False

    pts = calculate_points(
        bet.predicted_home_score,
        bet.predicted_away_score,
        fixture.home_score,
        fixture.away_score,
    )
    bet.points_earned = pts
    await _apply_settled_points_to_member(db, bet, fixture, pts)
    await db.flush()
    return True


async def get_scoring_bet_for_fixture(
    db: AsyncSession,
    user_id: uuid.UUID,
    fixture_id: uuid.UUID,
) -> Bet | None:
    """Best eligible bet for challenge/display: prefer settled points, then any eligible bet."""
    result = await db.execute(
        select(Bet).where(and_(Bet.user_id == user_id, Bet.fixture_id == fixture_id))
    )
    bets = [b for b in result.scalars().all() if bet_eligible_for_scoring(b)]
    if not bets:
        return None
    with_points = [b for b in bets if b.points_earned is not None]
    if with_points:
        return max(with_points, key=lambda b: (b.points_earned or 0, b.created_at))
    return bets[0]


async def settle_fixture_bets(db: AsyncSession, fixture: Fixture) -> SettleResult:
    """Calculate and assign points for all unsettled bets of a finished fixture."""
    if fixture.status != "finished" or fixture.home_score is None or fixture.away_score is None:
        return SettleResult(0, 0)

    result = await db.execute(
        select(Bet).where(
            and_(Bet.fixture_id == fixture.id, Bet.points_earned == None)  # noqa
        )
    )
    bets = result.scalars().all()
    settled = 0
    skipped = 0

    for bet in bets:
        if not bet_eligible_for_scoring(bet):
            skipped += 1
            continue
        if await settle_single_bet(db, bet, fixture):
            settled += 1

    logger.info(
        "bets_settled",
        fixture_id=str(fixture.id),
        count=settled,
        skipped_unconfirmed=skipped,
    )
    return SettleResult(settled_count=settled, skipped_unconfirmed_extras=skipped)


async def repair_unconfirmed_extra_settlement(db: AsyncSession) -> int:
    """
    Undo points wrongly assigned to unpaid extras (amount > 0, not confirmed).
    Returns number of bets repaired.
    """
    result = await db.execute(
        select(Bet).where(
            and_(
                Bet.amount > 0,
                Bet.amount_confirmed == False,  # noqa: E712
                Bet.points_earned.isnot(None),  # noqa: E711
            )
        )
    )
    bets = result.scalars().all()
    repaired = 0
    for bet in bets:
        pts = bet.points_earned or 0
        target_group_id = await _resolve_target_group_id(db, bet)
        if target_group_id and pts > 0:
            member_result = await db.execute(
                select(GroupMember).where(
                    and_(GroupMember.group_id == target_group_id, GroupMember.user_id == bet.user_id)
                )
            )
            member = member_result.scalar_one_or_none()
            if member:
                member.total_points = max(0, member.total_points - pts)
        bet.points_earned = None
        repaired += 1
    if repaired:
        await db.flush()
        logger.info("repair_unconfirmed_extra_settlement", count=repaired)
    return repaired


def allocate_first_place_prizes(
    leaderboard: list,
    prize_pool: Decimal,
) -> list[tuple[object, Decimal]]:
    """
    One winner takes 100% of the pool. If several players tie for most points,
    the pool is split equally among them (remainder cents go to the first).
    """
    from decimal import ROUND_DOWN

    if not leaderboard or prize_pool <= 0:
        return []
    max_points = leaderboard[0].total_points
    leaders = [e for e in leaderboard if e.total_points == max_points]
    if not leaders:
        return []
    n = len(leaders)
    per = (prize_pool / Decimal(n)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    amounts = [per] * n
    remainder = prize_pool - per * n
    if remainder > 0:
        amounts[0] += remainder
    return list(zip(leaders, amounts))


