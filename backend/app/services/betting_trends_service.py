"""Aggregate bet distribution for a fixture (only while betting is open)."""
import uuid
from collections import defaultdict

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture


def _outcome_key(home: int, away: int) -> str:
    if home > away:
        return "home_win"
    if away > home:
        return "away_win"
    return "draw"


async def get_fixture_betting_trends(db: AsyncSession, fixture_id: uuid.UUID) -> dict | None:
    fixture = await db.get(Fixture, fixture_id)
    if not fixture:
        return None
    if fixture.is_locked or not fixture.betting_open or fixture.status != "scheduled":
        return {
            "fixture_id": str(fixture_id),
            "available": False,
            "reason": "closed",
            "total_bets": 0,
            "outcomes": [],
            "top_scores": [],
        }

    total_res = await db.execute(
        select(func.count()).select_from(Bet).where(Bet.fixture_id == fixture_id)
    )
    total = int(total_res.scalar() or 0)
    if total == 0:
        return {
            "fixture_id": str(fixture_id),
            "available": True,
            "total_bets": 0,
            "outcomes": [
                {"key": "home_win", "label": f"Gana {fixture.home_team}", "count": 0, "pct": 0.0},
                {"key": "draw", "label": "Empate", "count": 0, "pct": 0.0},
                {"key": "away_win", "label": f"Gana {fixture.away_team}", "count": 0, "pct": 0.0},
            ],
            "top_scores": [],
        }

    rows = (
        await db.execute(
            select(Bet.predicted_home_score, Bet.predicted_away_score).where(
                Bet.fixture_id == fixture_id
            )
        )
    ).all()

    outcome_counts: dict[str, int] = defaultdict(int)
    score_counts: dict[tuple[int, int], int] = defaultdict(int)
    for h, a in rows:
        outcome_counts[_outcome_key(h, a)] += 1
        score_counts[(h, a)] += 1

    def pct(n: int) -> float:
        return round(100.0 * n / total, 1)

    outcomes = [
        {
            "key": "home_win",
            "label": f"Gana {fixture.home_team}",
            "count": outcome_counts["home_win"],
            "pct": pct(outcome_counts["home_win"]),
        },
        {
            "key": "draw",
            "label": "Empate",
            "count": outcome_counts["draw"],
            "pct": pct(outcome_counts["draw"]),
        },
        {
            "key": "away_win",
            "label": f"Gana {fixture.away_team}",
            "count": outcome_counts["away_win"],
            "pct": pct(outcome_counts["away_win"]),
        },
    ]

    top_scores = sorted(score_counts.items(), key=lambda x: -x[1])[:5]
    return {
        "fixture_id": str(fixture_id),
        "available": True,
        "total_bets": total,
        "outcomes": outcomes,
        "top_scores": [
            {
                "score": f"{h}-{a}",
                "count": c,
                "pct": pct(c),
            }
            for (h, a), c in top_scores
        ],
    }
