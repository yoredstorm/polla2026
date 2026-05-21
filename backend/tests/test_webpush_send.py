"""Ensure webpush is called with supported keyword arguments only."""
from unittest.mock import patch, MagicMock

import pytest

from app.models.push_subscription import PushSubscription
from app.services import push_service


@pytest.mark.asyncio
async def test_send_one_subscription_does_not_pass_vapid_public_key(monkeypatch):
    monkeypatch.setattr(
        push_service.settings,
        "VAPID_PUBLIC_KEY",
        "BIqzYsOiaU0RBVVaN4RhsJCnGp02QO9T8PywY08zvg9js83aK7J3Pd4_YkW66BO1CGYAYFiTzDIrSdPYeBXh5Ow",
    )
    monkeypatch.setattr(
        push_service.settings,
        "VAPID_PRIVATE_KEY",
        "g5iyoLfzVn2oydLYnvIP8sKi5IaYTOVkhIkTxBjunGk",
    )
    monkeypatch.setattr(push_service.settings, "VAPID_CLAIMS_SUB", "mailto:test@example.com")

    sub = MagicMock(spec=PushSubscription)
    sub.endpoint = "https://fcm.googleapis.com/fcm/send/test"
    sub.p256dh = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQaIQhFf6v9N8"
    sub.auth = "tBHItJI5svbpez7KI4CCXg=="

    with patch("pywebpush.webpush") as mock_webpush:
        push_service._send_one_subscription(
            sub, title="T", body="B", data={"url": "/notifications"}
        )
        _, kwargs = mock_webpush.call_args
        assert "vapid_public_key" not in kwargs
        assert kwargs.get("vapid_private_key")
        assert kwargs.get("ttl") == 86400
