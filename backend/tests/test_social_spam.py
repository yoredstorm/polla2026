"""Tests for social spam mute escalation."""
from datetime import timedelta

from app.services.social_spam_guard import MUTE_MINUTES_BY_STRIKE, _mute_duration


def test_mute_duration_escalation():
    assert _mute_duration(1) == timedelta(minutes=30)
    assert _mute_duration(2) == timedelta(minutes=60)
    assert _mute_duration(6) == timedelta(minutes=1440)
    assert _mute_duration(99) == timedelta(minutes=1440)


def test_strike_table_length():
    assert len(MUTE_MINUTES_BY_STRIKE) == 6
