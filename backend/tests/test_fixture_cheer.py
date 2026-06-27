"""Tests for fixture team cheer endpoint and rate guard."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.fixture import Fixture
from app.services import fixture_cheer_guard as guard
from tests.conftest import get_api_error_code, register_payload


class FakeRedis:
    def __init__(self) -> None:
        self._data: dict[str, str] = {}
        self._ttl: dict[str, int] = {}

    async def set(self, key: str, value: str, nx: bool = False, ex: int | None = None):
        if nx and key in self._data:
            return None
        self._data[key] = value
        if ex is not None:
            self._ttl[key] = ex
        return True

    async def incr(self, key: str) -> int:
        current = int(self._data.get(key, "0")) + 1
        self._data[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        if key in self._data:
            self._ttl[key] = seconds
            return True
        return False

    async def delete(self, key: str) -> int:
        existed = 1 if key in self._data else 0
        self._data.pop(key, None)
        self._ttl.pop(key, None)
        return existed

    async def ttl(self, key: str) -> int:
        if key not in self._data:
            return -2
        return self._ttl.get(key, -1)


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


@pytest.fixture(autouse=True)
def _noop_broadcast(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.api.v1.social.broadcast_fixture_cheer", _noop)


async def _register(client: AsyncClient, username: str) -> None:
    pw = "CheerFx1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    await client.post("/api/v1/auth/login", json={"username": username, "password": pw})


async def _live_fixture(db: AsyncSession, owner_id: uuid.UUID) -> Fixture:
    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Argentina",
        away_team="Portugal",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) - timedelta(minutes=30),
        status="live",
        home_score=1,
        away_score=0,
        round="R1",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=True,
        betting_open=False,
    )
    db.add(fixture)
    await db.flush()
    return fixture


@pytest.fixture
def _inject_fake_redis(fake_redis: FakeRedis, monkeypatch):
    import app.db.session as db_session_mod

    db_session_mod._redis_client = fake_redis

    async def _get_redis():
        return fake_redis

    monkeypatch.setattr(db_session_mod, "get_redis", _get_redis)
    monkeypatch.setattr("app.api.deps.get_redis", _get_redis)


def test_mute_seconds_escalation():
    assert guard._mute_seconds(1) == 5 * 60
    assert guard._mute_seconds(2) == 10 * 60
    assert guard._mute_seconds(3) == 30 * 60
    assert guard._mute_seconds(99) == 30 * 60


async def test_record_fixture_cheer_burst_mutes(fake_redis: FakeRedis, monkeypatch):
    monkeypatch.setattr(guard, "CHEER_COOLDOWN_SEC", 0)
    user_id = uuid.uuid4()
    fixture_id = uuid.uuid4()

    for _ in range(guard.CHEER_BURST_LIMIT):
        await guard.record_fixture_cheer(fake_redis, user_id, fixture_id)
        await fake_redis.delete(f"cheer:cooldown:{user_id}:{fixture_id}")

    with pytest.raises(HTTPException) as exc:
        await guard.record_fixture_cheer(fake_redis, user_id, fixture_id)

    assert exc.value.status_code == 429
    body = exc.value.detail
    assert body["error"]["code"] == "CHEER_MUTED"
    assert body["error"]["retry_after"] == 5 * 60


async def test_record_fixture_cheer_cooldown(fake_redis: FakeRedis):
    user_id = uuid.uuid4()
    fixture_id = uuid.uuid4()

    await guard.record_fixture_cheer(fake_redis, user_id, fixture_id)

    with pytest.raises(HTTPException) as exc:
        await guard.record_fixture_cheer(fake_redis, user_id, fixture_id)

    assert exc.value.status_code == 429
    assert exc.value.detail["error"]["code"] == "CHEER_COOLDOWN"


async def test_cheer_live_ok(
    client: AsyncClient,
    db_session: AsyncSession,
    _inject_fake_redis,
):
    await _register(client, "cheer_live_user")
    me = await client.get("/api/v1/users/me")
    owner_id = uuid.UUID(me.json()["id"])
    fixture = await _live_fixture(db_session, owner_id)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/social/fixtures/{fixture.id}/cheer",
        json={"team": "home"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["team"] == "home"


async def test_cheer_not_live_returns_400(
    client: AsyncClient,
    db_session: AsyncSession,
    _inject_fake_redis,
):
    await _register(client, "cheer_sched_user")
    me = await client.get("/api/v1/users/me")
    owner_id = uuid.UUID(me.json()["id"])

    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Argentina",
        away_team="Portugal",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(hours=2),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=False,
        betting_open=True,
    )
    db_session.add(fixture)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/social/fixtures/{fixture.id}/cheer",
        json={"team": "away"},
    )
    assert resp.status_code == 400


async def test_cheer_burst_returns_429(
    client: AsyncClient,
    db_session: AsyncSession,
    fake_redis: FakeRedis,
    monkeypatch,
):
    monkeypatch.setattr(guard, "CHEER_COOLDOWN_SEC", 0)

    import app.db.session as db_session_mod

    db_session_mod._redis_client = fake_redis

    async def _get_redis():
        return fake_redis

    monkeypatch.setattr(db_session_mod, "get_redis", _get_redis)
    monkeypatch.setattr("app.api.deps.get_redis", _get_redis)

    await _register(client, "cheer_burst_user")
    me = await client.get("/api/v1/users/me")
    cheer_user_id = uuid.UUID(me.json()["id"])
    fixture = await _live_fixture(db_session, cheer_user_id)
    await db_session.commit()

    url = f"/api/v1/social/fixtures/{fixture.id}/cheer"
    for _ in range(guard.CHEER_BURST_LIMIT):
        ok = await client.post(url, json={"team": "home"})
        assert ok.status_code == 200
        await fake_redis.delete(f"cheer:cooldown:{cheer_user_id}:{fixture.id}")

    blocked = await client.post(url, json={"team": "home"})
    assert blocked.status_code == 429
    assert get_api_error_code(blocked.json()) == "CHEER_MUTED"
