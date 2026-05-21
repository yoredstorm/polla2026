"""Admin pending notifications include urgent push payload flags."""
import json
from unittest.mock import MagicMock, patch

from app.services.push_service import ADMIN_ACTIONABLE_TYPES, _send_one_subscription


def test_send_one_subscription_includes_urgent_for_admin_types(monkeypatch):
    from app.core import config

    monkeypatch.setattr(
        config.settings,
        "VAPID_PUBLIC_KEY",
        "BIqzYsOiaU0RBVVaN4RhsJCnGp02QO9T8PywY08zvg9js83aK7J3Pd4_YkW66BO1CGYAYFiTzDIrSdPYeBXh5Ow",
    )
    monkeypatch.setattr(
        config.settings,
        "VAPID_PRIVATE_KEY",
        "g5iyoLfzVn2oydLYnvIP8sKi5IaYTOVkhIkTxBjunGk",
    )
    monkeypatch.setattr(config.settings, "VAPID_CLAIMS_SUB", "mailto:test@example.com")

    sub = MagicMock()
    sub.endpoint = "https://fcm.googleapis.com/fcm/send/x"
    sub.p256dh = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQaIQhFf6v9N8"
    sub.auth = "tBHItJI5svbpez7KI4CCXg=="

    captured: dict = {}

    def fake_webpush(**kwargs):
        captured.update(kwargs)
        return MagicMock(status_code=201)

    with patch("pywebpush.webpush", side_effect=fake_webpush):
        _send_one_subscription(
            sub,
            title="Extra pendiente",
            body="Confirmar",
            data={
                "url": "/notifications?focus=1",
                "notification_id": "1",
                "type": "extra_bet_pending",
                "urgent": True,
                "priority": "high",
            },
        )

    payload = json.loads(captured["data"])
    assert payload["urgent"] is True
    assert payload["priority"] == "high"
    assert payload["type"] in ADMIN_ACTIONABLE_TYPES
