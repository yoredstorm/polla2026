"""Public predictions board for a fixture (live and finished)."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import GroupMember
from app.models.user import User
from app.services.bet_service import bet_eligible_for_scoring, calculate_points, pick_polla_fixture_bet
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


async def list_polla_fixture_scoring_bets(
    db: AsyncSession,
    group_id: uuid.UUID,
    fixture_id: uuid.UUID,
) -> list[tuple[Bet, User]]:
    """One scoring bet per polla member: includes free bets (group_id NULL) and extras."""
    result = await db.execute(
        select(Bet, User)
        .join(User, Bet.user_id == User.id)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(
            and_(
                GroupMember.group_id == group_id,
                Bet.fixture_id == fixture_id,
                or_(Bet.group_id == group_id, Bet.group_id.is_(None)),
            )
        )
        .order_by(Bet.created_at.asc())
    )

    by_user: dict[uuid.UUID, list[tuple[Bet, User]]] = {}
    for bet, user in result.all():
        by_user.setdefault(bet.user_id, []).append((bet, user))

    rows: list[tuple[Bet, User]] = []
    for pairs in by_user.values():
        eligible = [b for b, _ in pairs if bet_eligible_for_scoring(b)]
        bet = pick_polla_fixture_bet(eligible, group_id)
        if not bet:
            continue
        user = next(u for b, u in pairs if b.id == bet.id)
        rows.append((bet, user))
    return rows


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

    scoring_rows = await list_polla_fixture_scoring_bets(db, group_id, fixture_id)

    entries: list[dict[str, Any]] = []
    for bet, user in scoring_rows:
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
