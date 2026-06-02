"""FIFA milestone phase keys, labels, and fixture mapping (seven hitos)."""
from __future__ import annotations

from typing import Literal

from app.models.fixture import Fixture

PhaseKey = Literal[
    "groups",
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "third_place",
    "final",
]

PHASE_ORDER: list[PhaseKey] = [
    "groups",
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "third_place",
    "final",
]

PHASE_LABELS: dict[PhaseKey, str] = {
    "groups": "Grupos",
    "round_of_32": "16vos",
    "round_of_16": "8vos",
    "quarterfinal": "Cuartos",
    "semifinal": "Semifinal",
    "third_place": "3er puesto",
    "final": "Final",
}


def fixture_phase_key(fixture: Fixture) -> PhaseKey | None:
    """Map a fixture to one of the seven FIFA milestone phases."""
    if fixture.group_name:
        return "groups"
    r = (fixture.round or "").strip()
    if r == "Round of 32":
        return "round_of_32"
    if r == "Round of 16":
        return "round_of_16"
    if r == "Quarter-final":
        return "quarterfinal"
    if r == "Semi-final":
        return "semifinal"
    if r == "Match for third place":
        return "third_place"
    if r == "Final":
        return "final"
    return None


def milestone_phase_fixture_filter(phase_key: PhaseKey):
    if phase_key == "groups":
        return Fixture.group_name.isnot(None)
    if phase_key == "round_of_32":
        return Fixture.round == "Round of 32"
    if phase_key == "round_of_16":
        return Fixture.round == "Round of 16"
    if phase_key == "quarterfinal":
        return Fixture.round == "Quarter-final"
    if phase_key == "semifinal":
        return Fixture.round == "Semi-final"
    if phase_key == "third_place":
        return Fixture.round == "Match for third place"
    return Fixture.round == "Final"


def next_milestone_phase_key(current: PhaseKey) -> PhaseKey | None:
    try:
        idx = PHASE_ORDER.index(current)
    except ValueError:
        return None
    if idx + 1 >= len(PHASE_ORDER):
        return None
    return PHASE_ORDER[idx + 1]
