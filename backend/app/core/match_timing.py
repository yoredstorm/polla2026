"""Per-fixture deadlines: betting close, user change requests, admin resolve."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.fixture import Fixture

BETTING_CLOSE_BEFORE = timedelta(minutes=1)
USER_CHANGE_REQUEST_BEFORE = timedelta(hours=1)
ADMIN_RESOLVE_BEFORE = timedelta(minutes=1)
LIVE_START_WINDOW_AFTER = timedelta(hours=2)


def _kickoff(fixture: Fixture) -> datetime:
    return fixture.match_date


def betting_close_at(fixture: Fixture) -> datetime:
    return _kickoff(fixture) - BETTING_CLOSE_BEFORE


def user_change_request_closes_at(fixture: Fixture) -> datetime:
    return _kickoff(fixture) - USER_CHANGE_REQUEST_BEFORE


def admin_resolve_closes_at(fixture: Fixture) -> datetime:
    return _kickoff(fixture) - ADMIN_RESOLVE_BEFORE


def should_lock_fixture(fixture: Fixture, *, now: datetime | None = None) -> bool:
    """True when betting must close (1 minute before kickoff)."""
    t = now if now is not None else datetime.now(timezone.utc)
    return betting_close_at(fixture) <= t


def is_user_change_request_cutoff_passed(fixture: Fixture, *, now: datetime | None = None) -> bool:
    t = now if now is not None else datetime.now(timezone.utc)
    return user_change_request_closes_at(fixture) <= t


def is_admin_resolve_cutoff_passed(fixture: Fixture, *, now: datetime | None = None) -> bool:
    t = now if now is not None else datetime.now(timezone.utc)
    return admin_resolve_closes_at(fixture) <= t


def can_create_change_request_for_fixture(fixture: Fixture, *, now: datetime | None = None) -> bool:
    if fixture.status != "scheduled":
        return False
    return not is_user_change_request_cutoff_passed(fixture, now=now)


def can_resolve_change_request_for_fixture(fixture: Fixture, *, now: datetime | None = None) -> bool:
    if fixture.status != "scheduled":
        return False
    return not is_admin_resolve_cutoff_passed(fixture, now=now)


def live_start_deadline_at(fixture: Fixture) -> datetime:
    return _kickoff(fixture) + LIVE_START_WINDOW_AFTER


def is_admin_live_start_expired(fixture: Fixture, *, now: datetime | None = None) -> bool:
    if fixture.status != "scheduled":
        return False
    t = now if now is not None else datetime.now(timezone.utc)
    return t > live_start_deadline_at(fixture)


def can_admin_start_live(fixture: Fixture, *, now: datetime | None = None) -> bool:
    """True during the 2h window after kickoff while the fixture is still scheduled."""
    if fixture.status != "scheduled":
        return False
    t = now if now is not None else datetime.now(timezone.utc)
    kickoff = _kickoff(fixture)
    return kickoff <= t <= live_start_deadline_at(fixture)


def fixture_deadline_fields(fixture: Fixture) -> dict[str, datetime | None]:
    """Optional API fields for scheduled fixtures."""
    if fixture.status != "scheduled":
        return {
            "betting_closes_at": None,
            "change_request_closes_at": None,
            "admin_resolve_closes_at": None,
        }
    return {
        "betting_closes_at": betting_close_at(fixture),
        "change_request_closes_at": user_change_request_closes_at(fixture),
        "admin_resolve_closes_at": admin_resolve_closes_at(fixture),
    }
