import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Query, Request

from app.api.deps import CurrentUser, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.schemas.group import LeaderboardEntry
from app.services.group_service import get_global_leaderboard, get_weekly_leaderboard
from app.services.challenge_service import get_h2h_stats, get_primary_rival

router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])


@router.get("/global", response_model=list[LeaderboardEntry])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def global_leaderboard(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: Literal["points", "accuracy", "bets"] = Query("points"),
    min_bets: int = Query(1, ge=1, le=500),
):
    return await get_global_leaderboard(db, page=page, limit=limit, sort=sort, min_bets=min_bets)


@router.get("/weekly", response_model=list[LeaderboardEntry])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def weekly_leaderboard(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: Literal["points", "accuracy", "bets"] = Query("points"),
    min_bets: int = Query(1, ge=1, le=500),
):
    week_start = datetime.now(timezone.utc) - timedelta(days=7)
    return await get_weekly_leaderboard(
        db, page=page, limit=limit, sort=sort, min_bets=min_bets, week_start=week_start
    )


@router.get("/rival")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def my_rival(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
):
    """Primary duel rival for the current user (most H2H matches)."""
    rival = await get_primary_rival(db, current_user.id)
    if not rival:
        return {"rival": None}
    return {"rival": rival}


@router.get("/h2h/{opponent_id}")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def head_to_head(
    request: Request,
    opponent_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    return await get_h2h_stats(db, current_user.id, opponent_id)
