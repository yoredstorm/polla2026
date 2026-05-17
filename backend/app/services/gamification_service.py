"""Compute user badges from bet history and challenges."""
import uuid
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.challenge import Challenge


async def compute_badges(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    group_id: uuid.UUID | None = None,
    position: int | None = None,
) -> list[dict]:
    result = await db.execute(
        select(Bet, Fixture)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(Bet.user_id == user_id, Bet.points_earned.isnot(None))  # noqa: E711
        .order_by(Fixture.match_date.asc())
    )
    rows = result.all()
    badges: list[dict] = []

    exact_streak = 0
    max_exact_streak = 0
    point_streak = 0
    max_point_streak = 0
    exact_count = 0
    early_bets = 0
    quick_bets = 0

    for bet, fixture in rows:
        pts = bet.points_earned or 0
        if pts == 2:
            exact_count += 1
            exact_streak += 1
            max_exact_streak = max(max_exact_streak, exact_streak)
        else:
            exact_streak = 0
        if pts >= 1:
            point_streak += 1
            max_point_streak = max(max_point_streak, point_streak)
        else:
            point_streak = 0
        if bet.created_at and fixture.match_date:
            delta = (fixture.match_date - bet.created_at).total_seconds()
            if delta >= 86400:
                early_bets += 1
            if 0 <= delta < 3600:
                quick_bets += 1

    if max_exact_streak >= 3:
        badges.append({"id": "oracle", "label": "Oraculo", "description": "3 marcadores exactos seguidos"})
    if max_point_streak >= 5:
        badges.append({"id": "invicto", "label": "Invicto", "description": "5 partidos seguidos sumando puntos"})
    if early_bets >= 5:
        badges.append({"id": "madrugador", "label": "Madrugador", "description": "5+ apuestas con mas de 24h de anticipacion"})
    if exact_count >= 10:
        badges.append({"id": "snaiper", "label": "Snaiper", "description": "10 marcadores exactos en el torneo"})
    if quick_bets >= 5:
        badges.append({"id": "relampago", "label": "Relampago", "description": "5+ apuestas hechas en la ultima hora antes del partido"})

    if group_id is not None:
        await _append_challenge_badges(db, user_id, group_id, badges)

    if position is not None and 1 <= position <= 3:
        labels = {1: "Oro", 2: "Plata", 3: "Bronce"}
        badges.append({
            "id": "podium",
            "label": f"Podio {labels[position]}",
            "description": f"Top {position} del ranking de la polla",
        })

    return badges


async def _append_challenge_badges(
    db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID, badges: list[dict]
) -> None:
    res = await db.execute(
        select(Challenge)
        .where(
            Challenge.group_id == group_id,
            or_(Challenge.challenger_id == user_id, Challenge.challenged_id == user_id),
            Challenge.status == "settled",
        )
        .order_by(Challenge.settled_at.asc())
    )
    challenges = res.scalars().all()
    win_streak = 0
    max_win_streak = 0
    loss_streak = 0
    max_loss_streak = 0
    total_wins = 0

    for ch in challenges:
        if ch.winner_id == user_id:
            total_wins += 1
            win_streak += 1
            max_win_streak = max(max_win_streak, win_streak)
            loss_streak = 0
        elif ch.winner_id is not None:
            loss_streak += 1
            max_loss_streak = max(max_loss_streak, loss_streak)
            win_streak = 0
        else:
            win_streak = 0
            loss_streak = 0

    if max_win_streak >= 3:
        badges.append({"id": "hat_trick", "label": "Hat-trick", "description": "3 duelos ganados seguidos"})
    if max_win_streak >= 3 or total_wins >= 5:
        badges.append({"id": "challenge_king", "label": "Rey del duelo", "description": "Dominio en retos 1v1"})
    if max_loss_streak >= 3:
        badges.append({
            "id": "challenge_cursed",
            "label": "Marca del rival",
            "description": "3 duelos perdidos seguidos",
        })
