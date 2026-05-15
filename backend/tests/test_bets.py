"""
Tests for bet creation, locking, and access control.
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock

from app.services.bet_service import is_fixture_bettable, should_lock_fixture, create_bet
from app.schemas.bet import BetCreate


def make_fixture(status="scheduled", is_locked=False, hours_from_now=2):
    return SimpleNamespace(
        id=uuid.uuid4(),
        status=status,
        is_locked=is_locked,
        match_date=datetime.now(timezone.utc) + timedelta(hours=hours_from_now),
    )


class TestFixtureLocking:
    def test_not_locked_when_far_future(self):
        f = make_fixture(hours_from_now=5)
        assert should_lock_fixture(f) is False

    def test_locked_when_less_than_1_hour(self):
        f = make_fixture(hours_from_now=0.5)
        assert should_lock_fixture(f) is True

    def test_locked_when_past(self):
        f = make_fixture(hours_from_now=-1)
        assert should_lock_fixture(f) is True

    def test_is_bettable_when_scheduled_not_locked(self):
        f = make_fixture(status="scheduled", is_locked=False, hours_from_now=5)
        assert is_fixture_bettable(f) is True

    def test_not_bettable_when_locked(self):
        f = make_fixture(status="scheduled", is_locked=True, hours_from_now=5)
        assert is_fixture_bettable(f) is False

    def test_not_bettable_when_live(self):
        f = make_fixture(status="live", is_locked=False, hours_from_now=0)
        assert is_fixture_bettable(f) is False

    def test_not_bettable_when_finished(self):
        f = make_fixture(status="finished", is_locked=True, hours_from_now=-2)
        assert is_fixture_bettable(f) is False


class TestCalculatePoints:
    """Quick sanity checks, full tests in test_scoring.py"""

    def test_exact_score_3pts(self):
        from app.services.bet_service import calculate_points
        assert calculate_points(2, 1, 2, 1) == 3

    def test_wrong_0pts(self):
        from app.services.bet_service import calculate_points
        assert calculate_points(1, 0, 0, 2) == 0
