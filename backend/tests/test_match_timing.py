"""Tests for per-fixture timing windows."""
from datetime import datetime, timedelta, timezone
import uuid

import pytest

from app.core.match_timing import (
    ADMIN_RESOLVE_BEFORE,
    BETTING_CLOSE_BEFORE,
    USER_CHANGE_REQUEST_BEFORE,
    can_create_change_request_for_fixture,
    can_resolve_change_request_for_fixture,
    should_lock_fixture,
)
from app.models.fixture import Fixture


def _fixture(*, minutes_from_now: float) -> Fixture:
    return Fixture(
        id=uuid.uuid4(),
        external_id=999002,
        home_team="A",
        away_team="B",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(minutes=minutes_from_now),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="G",
        venue=None,
        season=2026,
        is_locked=False,
        betting_open=True,
    )


def test_should_lock_one_minute_before_kickoff():
    assert should_lock_fixture(_fixture(minutes_from_now=2)) is False
    assert should_lock_fixture(_fixture(minutes_from_now=0.5)) is True


def test_user_change_request_until_one_hour_before():
    f = _fixture(minutes_from_now=90)
    assert can_create_change_request_for_fixture(f) is True
    f2 = _fixture(minutes_from_now=30)
    assert can_create_change_request_for_fixture(f2) is False


def test_admin_can_resolve_between_one_hour_and_one_minute():
    f = _fixture(minutes_from_now=30)
    assert can_create_change_request_for_fixture(f) is False
    assert can_resolve_change_request_for_fixture(f) is True
    f2 = _fixture(minutes_from_now=0.5)
    assert can_resolve_change_request_for_fixture(f2) is False


def test_timing_constants():
    assert BETTING_CLOSE_BEFORE == timedelta(minutes=1)
    assert USER_CHANGE_REQUEST_BEFORE == timedelta(hours=1)
    assert ADMIN_RESOLVE_BEFORE == timedelta(minutes=1)
