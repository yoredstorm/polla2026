"""Live score timeline events on fixtures."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.models.fixture import Fixture


def _normalize_timeline(fixture: Fixture) -> list[dict]:
    raw = fixture.score_timeline
    if not raw:
        return []
    return list(raw)


def append_score_event(
    fixture: Fixture,
    *,
    home_score: int,
    away_score: int,
    recorded_by: uuid.UUID,
    event_type: str = "score_update",
    scoring_team: str | None = None,
) -> list[dict]:
    """Append timeline entry if score changed; return full timeline."""
    timeline = _normalize_timeline(fixture)
    if timeline:
        last = timeline[-1]
        if last.get("home_score") == home_score and last.get("away_score") == away_score:
            return timeline
    now = datetime.now(timezone.utc).isoformat()
    entry: dict = {
        "home_score": home_score,
        "away_score": away_score,
        "recorded_at": now,
        "recorded_by": str(recorded_by),
        "event_type": event_type,
    }
    if scoring_team is not None:
        entry["scoring_team"] = scoring_team
    timeline.append(entry)
    fixture.score_timeline = timeline
    fixture.home_score = home_score
    fixture.away_score = away_score
    return timeline


def register_goal(
    fixture: Fixture,
    *,
    team: str,
    recorded_by: uuid.UUID,
) -> tuple[list[dict], int, int, int, int]:
    """Increment score for home or away; return timeline and score deltas."""
    home = fixture.home_score if fixture.home_score is not None else 0
    away = fixture.away_score if fixture.away_score is not None else 0
    prev_home, prev_away = home, away
    if team == "home":
        home += 1
    elif team == "away":
        away += 1
    else:
        raise ValueError("team must be 'home' or 'away'")
    timeline = append_score_event(
        fixture,
        home_score=home,
        away_score=away,
        recorded_by=recorded_by,
        event_type="goal",
        scoring_team=team,
    )
    return timeline, home, away, prev_home, prev_away


def init_live_timeline(fixture: Fixture, *, recorded_by: uuid.UUID) -> list[dict]:
    """Start live tracking with current or 0-0 score."""
    home = fixture.home_score if fixture.home_score is not None else 0
    away = fixture.away_score if fixture.away_score is not None else 0
    fixture.score_timeline = []
    return append_score_event(
        fixture,
        home_score=home,
        away_score=away,
        recorded_by=recorded_by,
    )


def timeline_for_response(fixture: Fixture) -> list[dict]:
    return _normalize_timeline(fixture)
