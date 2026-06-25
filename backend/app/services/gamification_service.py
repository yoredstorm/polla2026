"""Compute user badges from bet history and challenges."""
import uuid
from typing import Literal

from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.challenge import Challenge
from app.models.social import FixtureComment, FixtureCommentMention, FixtureReaction

BadgeCategory = Literal["bets", "challenges", "ranking", "social"]

# Single source of truth for UI catalog and copy
BADGE_CATALOG: list[dict] = [
    {
        "id": "oracle",
        "label": "Oraculo",
        "description": "3 marcadores exactos seguidos",
        "category": "bets",
        "hint": "Apuesta al resultado exacto varias veces seguidas",
    },
    {
        "id": "invicto",
        "label": "Invicto",
        "description": "5 partidos seguidos sumando puntos (1 o 2 pts)",
        "category": "bets",
        "hint": "No falles el ganador ni el marcador en 5 partidos seguidos",
    },
    {
        "id": "madrugador",
        "label": "Madrugador",
        "description": "5+ apuestas con mas de 24h de anticipacion",
        "category": "bets",
        "hint": "Registra tus pronosticos con tiempo",
    },
    {
        "id": "snaiper",
        "label": "Snaiper",
        "description": "10 marcadores exactos en el torneo",
        "category": "bets",
        "hint": "Acumula aciertos exactos a lo largo del mundial",
    },
    {
        "id": "relampago",
        "label": "Relampago",
        "description": "5+ apuestas en la ultima hora antes del partido",
        "category": "bets",
        "hint": "Apuesta justo antes del pitido inicial",
    },
    {
        "id": "hat_trick",
        "label": "Hat-trick",
        "description": "3 duelos 1v1 ganados seguidos",
        "category": "challenges",
        "hint": "Gana tres retos consecutivos en Te reto",
    },
    {
        "id": "challenge_king",
        "label": "Rey del duelo",
        "description": "3 victorias seguidas o 5+ victorias totales en retos",
        "category": "challenges",
        "hint": "Domina los duelos contra otros jugadores",
    },
    {
        "id": "challenge_cursed",
        "label": "Marca del rival",
        "description": "3 duelos perdidos seguidos",
        "category": "challenges",
        "hint": "Medalla ironica por una mala racha en retos",
    },
    {
        "id": "podium",
        "label": "Podio",
        "description": "Top 1, 2 o 3 del ranking de la polla activa",
        "category": "ranking",
        "hint": "Sube en el ranking global del torneo",
    },
    {
        "id": "groups_phase_winner",
        "label": "Campeon de grupos",
        "description": "Ganador de la fase de grupos de la polla",
        "category": "ranking",
        "hint": "Lidera el ranking al cerrar la fase de grupos",
    },
    {
        "id": "comentarista",
        "label": "El Comentarista",
        "description": "5 partidos distintos comentados seguidos",
        "category": "social",
        "hint": "Comenta partidos consecutivos en la comunidad",
    },
    {
        "id": "reaccionador",
        "label": "El Reaccionador",
        "description": "15+ reacciones o reaccionar en 5 partidos",
        "category": "social",
        "hint": "Reacciona a los partidos del torneo",
    },
    {
        "id": "mencion_magnetica",
        "label": "Iman de menciones",
        "description": "3+ menciones en comentarios",
        "category": "social",
        "hint": "Hazte notar en los comentarios del grupo",
    },
    {
        "id": "polemico",
        "label": "Polemico",
        "description": "10+ comentarios en el torneo",
        "category": "social",
        "hint": "Participa activamente en el chat de partidos",
    },
]


def get_badge_catalog() -> list[dict]:
    return list(BADGE_CATALOG)


async def ranking_position_for_user(
    db: AsyncSession, user_id: uuid.UUID, group_id: uuid.UUID | None
) -> int | None:
    if not group_id:
        return None
    from app.services.group_service import get_group_leaderboard

    for entry in await get_group_leaderboard(db, group_id, min_bets=1):
        if entry.user_id == user_id and 1 <= entry.position <= 3:
            return entry.position
    return None


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

    from app.services.bet_service import bet_eligible_for_scoring

    for bet, fixture in rows:
        if not bet_eligible_for_scoring(bet):
            continue
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
        await _append_phase_winner_badges(db, user_id, group_id, badges)

    if position is not None and 1 <= position <= 3:
        labels = {1: "Oro", 2: "Plata", 3: "Bronce"}
        badges.append({
            "id": "podium",
            "label": f"Podio {labels[position]}",
            "description": f"Top {position} del ranking de la polla",
        })

    await _append_social_badges(db, user_id, badges)
    return badges


async def _append_phase_winner_badges(
    db: AsyncSession,
    user_id: uuid.UUID,
    group_id: uuid.UUID,
    badges: list[dict],
) -> None:
    from app.models.phase_winner import PhaseWinnerHistory

    result = await db.execute(
        select(PhaseWinnerHistory.phase_key).where(
            and_(
                PhaseWinnerHistory.group_id == group_id,
                PhaseWinnerHistory.winner_user_id == user_id,
            )
        )
    )
    phase_badges = {
        "groups": {
            "id": "groups_phase_winner",
            "label": "Campeon de grupos",
            "description": "Ganador de la fase de grupos de la polla",
        },
    }
    for (phase_key,) in result.all():
        meta = phase_badges.get(phase_key)
        if meta and not any(b["id"] == meta["id"] for b in badges):
            badges.append(dict(meta))


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


async def _append_social_badges(
    db: AsyncSession, user_id: uuid.UUID, badges: list[dict]
) -> None:
    comment_count = (
        await db.execute(
            select(func.count()).select_from(FixtureComment).where(FixtureComment.user_id == user_id)
        )
    ).scalar() or 0
    if comment_count >= 10:
        badges.append({
            "id": "polemico",
            "label": "Polemico",
            "description": "10+ comentarios en el torneo",
        })

    mention_count = (
        await db.execute(
            select(func.count())
            .select_from(FixtureCommentMention)
            .where(FixtureCommentMention.mentioned_user_id == user_id)
        )
    ).scalar() or 0
    if mention_count >= 3:
        badges.append({
            "id": "mencion_magnetica",
            "label": "Iman de menciones",
            "description": "3+ menciones en comentarios",
        })

    reaction_total = (
        await db.execute(
            select(func.count()).select_from(FixtureReaction).where(FixtureReaction.user_id == user_id)
        )
    ).scalar() or 0
    reaction_fixtures = (
        await db.execute(
            select(func.count(func.distinct(FixtureReaction.fixture_id))).where(
                FixtureReaction.user_id == user_id
            )
        )
    ).scalar() or 0
    if reaction_total >= 15 or reaction_fixtures >= 5:
        badges.append({
            "id": "reaccionador",
            "label": "El Reaccionador",
            "description": "15+ reacciones o reaccionar en 5 partidos",
        })

    fx_dates_res = await db.execute(
        select(Fixture.match_date)
        .join(FixtureComment, FixtureComment.fixture_id == Fixture.id)
        .where(FixtureComment.user_id == user_id)
        .group_by(Fixture.id, Fixture.match_date)
        .order_by(Fixture.match_date.asc())
    )
    dates = [row[0] for row in fx_dates_res.all()]
    streak = 1
    max_streak = 1
    for i in range(1, len(dates)):
        if dates[i] >= dates[i - 1]:
            streak += 1
            max_streak = max(max_streak, streak)
        else:
            streak = 1
    if max_streak >= 5:
        badges.append({
            "id": "comentarista",
            "label": "El Comentarista",
            "description": "5 partidos distintos comentados seguidos",
        })
