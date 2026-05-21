"""
Bet service — scoring logic, locking rules, prize distribution.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.core.match_timing import (
    can_create_change_request_for_fixture,
    can_resolve_change_request_for_fixture,
    should_lock_fixture,
)
from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
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
    "create_bet",
    "settle_fixture_bets",
    "settle_single_bet",
    "bet_eligible_for_scoring",
    "get_scoring_bet_for_fixture",
    "repair_unconfirmed_extra_settlement",
    "SettleResult",
    "calculate_prize_distribution",
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


def bet_eligible_for_scoring(bet: Bet) -> bool:
    """Free bets and zero-amount extras always count; paid extras require admin confirmation."""
    if bet.amount is None or bet.amount <= 0:
        return True
    return bet.amount_confirmed


def is_fixture_bettable(fixture: Fixture) -> bool:
    """A fixture is bettable if it's not locked, scheduled, and admin has opened betting."""
    return not fixture.is_locked and fixture.status == "scheduled" and fixture.betting_open


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
            if group.bet_amount_mode == "single_entry":
                # Entry fee covers all bets. Per-match extras are optional:
                # if the user sent amount > 0 AND the group has fixed_bet_amount, record it
                # pending admin confirmation. Otherwise 0.
                if (
                    data.amount and data.amount > 0
                    and group.fixed_bet_amount and group.fixed_bet_amount > 0
                ):
                    effective_amount = group.fixed_bet_amount
                else:
                    effective_amount = Decimal("0")
            elif group.bet_amount_mode == "per_bet" and group.fixed_bet_amount is not None:
                effective_amount = group.fixed_bet_amount

    # Extra amounts require admin confirmation before they count toward the prize pool.
    # Bets without a group or with amount=0 are auto-confirmed (nothing to collect).
    extra_needs_confirmation = bool(data.group_id and effective_amount > 0)

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


def calculate_prize_distribution(prize_pool: Decimal) -> dict:
    """60% 1st, 30% 2nd, 10% 3rd."""
    return {
        1: round(prize_pool * Decimal("0.60"), 2),
        2: round(prize_pool * Decimal("0.30"), 2),
        3: round(prize_pool * Decimal("0.10"), 2),
    }
