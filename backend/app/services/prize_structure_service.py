"""Effective prize phases per polla (1, 2, or 7 hitos) based on prize_structure_mode."""
from __future__ import annotations

from typing import Literal

from app.models.fixture import Fixture
from app.models.group import Group
from app.services.tournament_phases import (
    PHASE_ORDER,
    PHASE_LABELS,
    fixture_phase_key,
    milestone_phase_fixture_filter,
)

PrizeStructureMode = Literal["single_tournament", "groups_knockout", "full_milestones"]

PRIZE_STRUCTURE_MODES: tuple[PrizeStructureMode, ...] = (
    "single_tournament",
    "groups_knockout",
    "full_milestones",
)

SYNTHETIC_LABELS: dict[str, str] = {
    "tournament": "Mundial completo",
    "knockout": "Eliminatorias",
}

PHASES_BY_MODE: dict[PrizeStructureMode, list[str]] = {
    "single_tournament": ["tournament"],
    "groups_knockout": ["groups", "knockout"],
    "full_milestones": list(PHASE_ORDER),
}


def normalize_prize_structure_mode(mode: str | None) -> PrizeStructureMode:
    if mode in PRIZE_STRUCTURE_MODES:
        return mode  # type: ignore[return-value]
    return "full_milestones"


def get_prize_structure_mode(group: Group) -> PrizeStructureMode:
    return normalize_prize_structure_mode(getattr(group, "prize_structure_mode", None))


def initial_phase_key_for_mode(mode: PrizeStructureMode) -> str:
    if mode == "single_tournament":
        return "tournament"
    return "groups"


def get_effective_phases(group: Group) -> list[str]:
    return list(PHASES_BY_MODE[get_prize_structure_mode(group)])


def phase_label(phase_key: str, group: Group | None = None) -> str:
    if phase_key in SYNTHETIC_LABELS:
        return SYNTHETIC_LABELS[phase_key]
    if phase_key in PHASE_LABELS:
        return PHASE_LABELS[phase_key]  # type: ignore[index]
    return phase_key


def is_effective_phase(phase_key: str, group: Group) -> bool:
    return phase_key in get_effective_phases(group)


def next_effective_phase_key(group: Group, current: str) -> str | None:
    phases = get_effective_phases(group)
    try:
        idx = phases.index(current)
    except ValueError:
        return None
    if idx + 1 >= len(phases):
        return None
    return phases[idx + 1]


def fixture_effective_phase_key(fixture: Fixture, group: Group) -> str | None:
    mode = get_prize_structure_mode(group)
    if mode == "single_tournament":
        return "tournament"
    if mode == "groups_knockout":
        if fixture.group_name:
            return "groups"
        return "knockout"
    return fixture_phase_key(fixture)


def effective_phase_fixture_filter(phase_key: str, group: Group):
    mode = get_prize_structure_mode(group)
    if mode == "single_tournament":
        if phase_key != "tournament":
            raise ValueError(f"Invalid phase {phase_key} for single_tournament")
        return Fixture.id.isnot(None)
    if mode == "groups_knockout":
        if phase_key == "groups":
            return Fixture.group_name.isnot(None)
        if phase_key == "knockout":
            return Fixture.group_name.is_(None)
        raise ValueError(f"Invalid phase {phase_key} for groups_knockout")
    if phase_key not in PHASE_ORDER:
        raise ValueError(f"Invalid phase {phase_key} for full_milestones")
    return milestone_phase_fixture_filter(phase_key)  # type: ignore[arg-type]


def list_tournament_phases_for_group(group: Group) -> list[dict[str, str]]:
    return [{"key": k, "label": phase_label(k, group)} for k in get_effective_phases(group)]
