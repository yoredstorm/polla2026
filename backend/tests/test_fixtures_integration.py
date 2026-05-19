"""
Integration tests for fixtures endpoints.
Uses in-memory SQLite DB + the World Cup JSON loader.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.worldcup_loader import load_fixtures
from app.models.fixture import Fixture
from app.services.bet_service import should_lock_fixture


# ─── helpers ────────────────────────────────────────────────────────────────

async def _seed_fixtures(db: AsyncSession):
    """Insert a handful of fixtures from the JSON loader into the test DB."""
    records = load_fixtures()[:10]  # Only first 10 for speed
    for data in records:
        fixture = Fixture(**data)
        if should_lock_fixture(fixture):
            fixture.is_locked = True
        db.add(fixture)
    await db.flush()


async def _register_and_login(client: AsyncClient, idx: int = 0):
    from tests.conftest import register_payload

    pw = "FxPass1!"
    uname = f"fx_user{idx}"
    await client.post("/api/v1/auth/register", json=register_payload(uname, password=pw))
    resp = await client.post("/api/v1/auth/login", json={"username": uname, "password": pw})
    assert resp.status_code == 200
    return resp.cookies


# ─── tests ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_fixtures_requires_auth(client: AsyncClient):
    resp = await client.get("/api/v1/fixtures")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_fixtures_returns_paginated(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=1)

    resp = await client.get("/api/v1/fixtures?limit=5", cookies=cookies)
    assert resp.status_code == 200
    body = resp.json()
    assert "data" in body
    assert "pagination" in body
    assert len(body["data"]) <= 5
    assert body["pagination"]["total"] >= 1


@pytest.mark.asyncio
async def test_list_fixtures_filter_by_group(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=2)

    resp = await client.get("/api/v1/fixtures?group_name=Group+A", cookies=cookies)
    assert resp.status_code == 200
    body = resp.json()
    for fx in body["data"]:
        assert fx["group_name"] == "Group A"


@pytest.mark.asyncio
async def test_list_fixtures_filter_by_status(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=3)

    resp = await client.get("/api/v1/fixtures?status=scheduled", cookies=cookies)
    assert resp.status_code == 200
    body = resp.json()
    for fx in body["data"]:
        assert fx["status"] == "scheduled"


@pytest.mark.asyncio
async def test_get_fixture_by_id(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=4)

    # List to get an ID
    list_resp = await client.get("/api/v1/fixtures?limit=1", cookies=cookies)
    assert list_resp.status_code == 200
    fixtures = list_resp.json()["data"]
    assert len(fixtures) >= 1
    fixture_id = fixtures[0]["id"]

    # Fetch by ID
    detail_resp = await client.get(f"/api/v1/fixtures/{fixture_id}", cookies=cookies)
    assert detail_resp.status_code == 200
    fx = detail_resp.json()
    assert fx["id"] == fixture_id
    assert "home_team" in fx
    assert "away_team" in fx
    assert "group_name" in fx
    assert "venue" in fx


@pytest.mark.asyncio
async def test_get_fixture_not_found(client: AsyncClient, db_session: AsyncSession):
    cookies = await _register_and_login(client, idx=5)
    import uuid
    resp = await client.get(f"/api/v1/fixtures/{uuid.uuid4()}", cookies=cookies)
    assert resp.status_code == 404
    assert resp.json()["detail"]["error"]["code"] == "FIXTURE_NOT_FOUND"


@pytest.mark.asyncio
async def test_live_fixtures_returns_list(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=6)
    resp = await client.get("/api/v1/fixtures/live", cookies=cookies)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_list_groups_returns_group_names(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=7)
    resp = await client.get("/api/v1/fixtures/groups", cookies=cookies)
    assert resp.status_code == 200
    groups = resp.json()
    assert isinstance(groups, list)
    # At least some groups should be present from the 10 seeded fixtures
    assert len(groups) >= 1
    for g in groups:
        assert g.startswith("Group ")


@pytest.mark.asyncio
async def test_fixture_response_has_world_cup_fields(client: AsyncClient, db_session: AsyncSession):
    await _seed_fixtures(db_session)
    cookies = await _register_and_login(client, idx=8)
    resp = await client.get("/api/v1/fixtures?limit=1", cookies=cookies)
    assert resp.status_code == 200
    fx = resp.json()["data"][0]
    assert fx["league_name"] == "FIFA World Cup 2026"
    assert fx["season"] == 2026
    assert fx["home_logo_url"] is not None  # flag URL from flagcdn.com


@pytest.mark.asyncio
async def test_seed_requires_admin(client: AsyncClient, db_session: AsyncSession):
    """Non-admin users cannot re-seed fixtures."""
    cookies = await _register_and_login(client, idx=9)
    resp = await client.post("/api/v1/fixtures/seed", cookies=cookies)
    assert resp.status_code == 403
