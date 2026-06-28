"""Automated fixture transitions for Google live sync (mirrors admin API)."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import redis.asyncio as aioredis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import GroupMember
from app.models.user import User
from app.services.audit import log_action
from app.services.bet_service import cancel_unpaid_extras_for_fixture, settle_fixture_bets
from app.services.fixture_score_timeline_service import append_score_event, init_live_timeline
from app.services.notification_service import (
    broadcast_fixture_updated,
    broadcast_goal_scored,
    build_fixture_finished,
    notify_all_active_users,
)

SYSTEM_ACTOR_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def fixture_match_minute(fixture: Fixture) -> int | None:
    kickoff = fixture.match_date
    if kickoff is None:
        return None
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - kickoff
    minutes = int(elapsed.total_seconds() // 60)
    if minutes < 0:
        return None
    return min(minutes, 120)


@dataclass
class AutoSettleResult:
    settled_count: int
    skipped_unconfirmed_extras: int


async def auto_start_live(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
    *,
    actor_id: uuid.UUID | None = None,
) -> None:
    if fixture.status != "scheduled":
        return
    recorded_by = actor_id or SYSTEM_ACTOR_ID
    fixture.status = "live"
    fixture.is_locked = True
    fixture.betting_open = False
    await cancel_unpaid_extras_for_fixture(db, fixture, reason="auto_sync_live")
    init_live_timeline(fixture, recorded_by=recorded_by)
    await db.flush()
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )


async def auto_update_live_score(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
    *,
    home_score: int,
    away_score: int,
    actor_id: uuid.UUID | None = None,
) -> None:
    if fixture.status != "live":
        return
    recorded_by = actor_id or SYSTEM_ACTOR_ID
    prev_home = fixture.home_score if fixture.home_score is not None else 0
    prev_away = fixture.away_score if fixture.away_score is not None else 0

    timeline = append_score_event(
        fixture,
        home_score=home_score,
        away_score=away_score,
        recorded_by=recorded_by,
    )
    await db.flush()
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )

    home_delta = home_score - prev_home
    away_delta = away_score - prev_away
    if home_delta == 1 and away_delta == 0:
        team = "home"
    elif away_delta == 1 and home_delta == 0:
        team = "away"
    else:
        return

    recorded_at = timeline[-1]["recorded_at"] if timeline else datetime.now(timezone.utc).isoformat()
    scoring_name = fixture.home_team if team == "home" else fixture.away_team
    await broadcast_goal_scored(
        db,
        redis,
        fixture_id=fixture.id,
        team=team,
        scoring_team_name=scoring_name,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
        home_score=home_score,
        away_score=away_score,
        previous_home_score=prev_home,
        previous_away_score=prev_away,
        minute=fixture_match_minute(fixture),
        recorded_at=recorded_at,
    )


async def auto_settle_fixture(
    db: AsyncSession,
    redis: aioredis.Redis | None,
    fixture: Fixture,
    *,
    home_score: int,
    away_score: int,
    actor_id: uuid.UUID | None = None,
) -> AutoSettleResult:
    fixture.home_score = home_score
    fixture.away_score = away_score
    fixture.status = "finished"
    fixture.is_locked = True
    fixture.betting_open = False
    await db.flush()
    await cancel_unpaid_extras_for_fixture(db, fixture, reason="auto_sync_settle")

    settle_result = await settle_fixture_bets(db, fixture)
    from app.services.challenge_service import settle_challenges_for_fixture

    await settle_challenges_for_fixture(db, redis, fixture)
    from app.services.tournament_phase_service import get_active_polla, try_close_completed_phases

    polla = await get_active_polla(db, competition_id=fixture.competition_id)
    if polla:
        prev_pool = polla.prize_pool
        closed_phases = await try_close_completed_phases(db, polla.id, redis)
        if closed_phases:
            from app.services.notification_service import broadcast_polla_updated

            await db.refresh(polla)
            member_count = (
                await db.execute(
                    select(func.count())
                    .select_from(GroupMember)
                    .where(GroupMember.group_id == polla.id)
                )
            ).scalar() or 0
            await broadcast_polla_updated(
                db,
                redis,
                group_id=polla.id,
                prize_pool=polla.prize_pool,
                previous_prize_pool=prev_pool,
                member_count=int(member_count),
                reason="phase_closed",
            )
    from app.services.badge_notify_service import notify_new_badges_for_fixture

    await notify_new_badges_for_fixture(db, redis, fixture.id)

    breakdown_q = (
        select(User.username, Bet.points_earned)
        .join(User, Bet.user_id == User.id)
        .where(
            Bet.fixture_id == fixture.id,
            Bet.points_earned.isnot(None),  # noqa: E711
            (Bet.amount <= 0) | (Bet.amount_confirmed == True),  # noqa: E712
        )
        .order_by(Bet.points_earned.desc())
    )
    breakdown_rows = (await db.execute(breakdown_q)).all()
    user_breakdown = [
        {"username": r.username, "points_earned": int(r.points_earned or 0)}
        for r in breakdown_rows
    ]

    nt, nb, np = build_fixture_finished(
        fixture_id=str(fixture.id),
        home_team=fixture.home_team,
        away_team=fixture.away_team,
        home_score=home_score,
        away_score=away_score,
    )
    notified = await notify_all_active_users(
        db, redis, type="fixture_finished", title=nt, body=nb, payload=np,
    )
    await broadcast_fixture_updated(
        db,
        redis,
        fixture_id=fixture.id,
        status=fixture.status,
        home_score=fixture.home_score,
        away_score=fixture.away_score,
        home_team=fixture.home_team,
        away_team=fixture.away_team,
    )
    await log_action(
        db,
        user_id=actor_id,
        action="auto_settle",
        detail={
            "source": "google_sync",
            "fixture_id": str(fixture.id),
            "home_score": home_score,
            "away_score": away_score,
            "status": "finished",
            "settled_count": settle_result.settled_count,
            "skipped_unconfirmed_extras": settle_result.skipped_unconfirmed_extras,
            "notified_users_count": len(notified),
            "user_breakdown": user_breakdown,
        },
        ip=None,
    )
    return AutoSettleResult(
        settled_count=settle_result.settled_count,
        skipped_unconfirmed_extras=settle_result.skipped_unconfirmed_extras,
    )
