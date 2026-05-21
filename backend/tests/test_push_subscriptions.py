"""Web Push subscribe API and VAPID config."""
import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_subscription import PushSubscription
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _vapid_settings(monkeypatch):
    from app.core import config

    monkeypatch.setattr(
        config.settings,
        "VAPID_PUBLIC_KEY",
        "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQaIQhFf6v9N8",
    )
    monkeypatch.setattr(
        config.settings,
        "VAPID_PRIVATE_KEY",
        "UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls",
    )
    monkeypatch.setattr(config.settings, "VAPID_CLAIMS_SUB", "mailto:test@example.com")


async def _register(client: AsyncClient, username: str) -> object:
    pw = "PushTest1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    return resp.cookies


@pytest.mark.asyncio
async def test_vapid_public_key_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/notifications/push/vapid-public-key")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_subscribe_and_unsubscribe(client: AsyncClient, db_session: AsyncSession):
    cookies = await _register(client, "push_user1")
    key_resp = await client.get("/api/v1/notifications/push/vapid-public-key", cookies=cookies)
    assert key_resp.status_code == 200
    assert key_resp.json()["publicKey"]

    endpoint = f"https://push.example.com/sub/{uuid.uuid4()}"
    sub_body = {
        "endpoint": endpoint,
        "keys": {"p256dh": "test-p256dh-key", "auth": "test-auth-key"},
    }
    with patch("app.services.push_service._send_one_subscription"):
        sub_resp = await client.post(
            "/api/v1/notifications/push/subscribe",
            json=sub_body,
            cookies=cookies,
        )
    assert sub_resp.status_code == 200

    row = (
        await db_session.execute(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
    ).scalar_one_or_none()
    assert row is not None

    unsub = await client.request(
        "DELETE",
        "/api/v1/notifications/push/unsubscribe",
        json={"endpoint": endpoint},
        cookies=cookies,
    )
    assert unsub.status_code == 200

    row2 = (
        await db_session.execute(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
    ).scalar_one_or_none()
    assert row2 is None


@pytest.mark.asyncio
async def test_push_status(client: AsyncClient):
    cookies = await _register(client, "push_status_user")
    r = await client.get("/api/v1/notifications/push/status", cookies=cookies)
    assert r.status_code == 200
    data = r.json()
    assert data["vapidConfigured"] is True
    assert data["serverSubscriptionCount"] == 0
    assert data["serverRegistered"] is False


@pytest.mark.asyncio
async def test_push_test_requires_subscription(client: AsyncClient):
    cookies = await _register(client, "push_test_user")
    r = await client.post("/api/v1/notifications/push/test", cookies=cookies)
    assert r.status_code == 400
