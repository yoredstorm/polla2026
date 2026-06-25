"""Public predictions board for a fixture (live and finished)."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.user import User
from app.services.bet_service import bet_eligible_for_scoring, calculate_points
from app.services.fixture_score_timeline_service import timeline_for_response


def _should_blur_prediction(
    target: User,
    viewer_id: uuid.UUID,
    *,
    viewer_is_admin: bool,
) -> bool:
    if viewer_is_admin or target.id == viewer_id:
        return False
    return getattr(target, "bets_profile_visibility", "public") == "invite_only"


async def build_fixture_predictions_board(
    db: AsyncSession,
    group_id: uuid.UUID,
    fixture_id: uuid.UUID,
    viewer_id: uuid.UUID,
    *,
    viewer_is_admin: bool = False,
    score_home: int | None = None,
    score_away: int | None = None,
) -> dict[str, Any]:
    fx_res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = fx_res.scalar_one_or_none()
    if not fixture:
        raise ValueError("FIXTURE_NOT_FOUND")

    if fixture.status not in ("live", "finished"):
        raise ValueError("FIXTURE_NOT_LIVE")

    home_score = score_home if score_home is not None else (fixture.home_score if fixture.home_score is not None else 0)
    away_score = score_away if score_away is not None else (fixture.away_score if fixture.away_score is not None else 0)

    result = await db.execute(
        select(Bet, User)
        .join(User, Bet.user_id == User.id)
        .where(and_(Bet.group_id == group_id, Bet.fixture_id == fixture_id))
        .order_by(Bet.created_at.asc())
    )

    entries: list[dict[str, Any]] = []
    for bet, user in result.all():
        if not bet_eligible_for_scoring(bet):
            continue
        blurred = _should_blur_prediction(user, viewer_id, viewer_is_admin=viewer_is_admin)
        projected = None
        points = bet.points_earned
        if fixture.status == "live":
            projected = calculate_points(
                bet.predicted_home_score,
                bet.predicted_away_score,
                home_score,
                away_score,
            )
        elif fixture.status == "finished" and score_home is not None:
            projected = calculate_points(
                bet.predicted_home_score,
                bet.predicted_away_score,
                home_score,
                away_score,
            )
        display_points = points if fixture.status == "finished" and points is not None else projected

        entries.append(
            {
                "user_id": str(user.id),
                "username": None if blurred else user.username,
                "first_name": None if blurred else user.first_name,
                "last_name": None if blurred else user.last_name,
                "predicted_home_score": None if blurred else bet.predicted_home_score,
                "predicted_away_score": None if blurred else bet.predicted_away_score,
                "projected_points": projected,
                "points_earned": points,
                "display_points": display_points if display_points is not None else 0,
                "is_blurred": blurred,
                "amount": str(bet.amount),
                "show_bet_amounts": bool(getattr(user, "show_bet_amounts", True)),
            }
        )

    entries.sort(
        key=lambda e: (
            -(e["display_points"] or 0),
            e.get("username") or "",
        )
    )
    for pos, entry in enumerate(entries, start=1):
        entry["position"] = pos

    return {
        "fixture_id": str(fixture_id),
        "group_id": str(group_id),
        "status": fixture.status,
        "home_score": home_score,
        "away_score": away_score,
        "participant_count": len(entries),
        "score_timeline": timeline_for_response(fixture),
        "entries": entries,
    }
