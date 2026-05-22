"""User Web Push category preferences."""
from __future__ import annotations

import json
from typing import Any

NOTIFICATION_CATEGORY_TYPES: dict[str, tuple[str, ...]] = {
    "challenges": (
        "challenge_pending",
        "challenge_accepted",
        "challenge_rejected",
        "challenge_settled",
        "challenge_received",
        "challenge_resolved",
    ),
    "fixtures": (
        "fixture_finished",
        "fixture_betting_closed",
        "following_bet",
    ),
    "social": (
        "social_follow",
        "comment_mention",
        "badge_earned",
    ),
    "admin": (
        "entry_pending",
        "entry_confirmed",
        "extra_bet_pending",
        "extra_confirmed",
        "change_request_pending",
        "change_request_resolved",
        "change_request_expired",
        "change_request_expired_batch",
        "password_reset_pending",
        "password_reset_resolved",
        "fixture_betting_closed_admin",
        "fixture_betting_soon_admin",
    ),
}

DEFAULT_PUSH_PREFERENCES: dict[str, bool] = {
    "challenges": True,
    "fixtures": True,
    "social": True,
    "admin": True,
}


def parse_push_preferences(raw: str | None) -> dict[str, bool]:
    if not raw:
        return dict(DEFAULT_PUSH_PREFERENCES)
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return dict(DEFAULT_PUSH_PREFERENCES)
        out = dict(DEFAULT_PUSH_PREFERENCES)
        for key in out:
            if key in data and isinstance(data[key], bool):
                out[key] = data[key]
        return out
    except json.JSONDecodeError:
        return dict(DEFAULT_PUSH_PREFERENCES)


def serialize_push_preferences(prefs: dict[str, bool]) -> str:
    merged = dict(DEFAULT_PUSH_PREFERENCES)
    for key in merged:
        if key in prefs and isinstance(prefs[key], bool):
            merged[key] = prefs[key]
    return json.dumps(merged)


def notification_category_for_type(notification_type: str) -> str:
    for category, types in NOTIFICATION_CATEGORY_TYPES.items():
        if notification_type in types:
            return category
    return "system"


def should_send_push_for_type(notification_type: str, prefs: dict[str, bool]) -> bool:
    cat = notification_category_for_type(notification_type)
    if cat == "system":
        return True
    return prefs.get(cat, True)
