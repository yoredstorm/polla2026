"""
Integration tests for auth endpoints (register, login, refresh, logout, change-password).
Uses the in-memory SQLite client fixture from conftest.py.
"""
import pytest
from httpx import AsyncClient


# ─── helpers ────────────────────────────────────────────────────────────────

async def _register(client: AsyncClient, username="alice", password="AlicePass1!"):
    from tests.conftest import register_payload

    return await client.post(
        "/api/v1/auth/register",
        json=register_payload(username, password=password, first_name="Alice", last_name="Wonder"),
    )


async def _login(client: AsyncClient, username="alice", password="AlicePass1!"):
    return await client.post("/api/v1/auth/login", json={"username": username, "password": password})


# ─── register ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_and_login_flow(client: AsyncClient):
    """Full happy-path: register → login → cookie set."""
    reg = await _register(client)
    assert reg.status_code == 201
    body = reg.json()
    assert body["username"] == "alice"
    assert "hashed_password" not in body

    login_resp = await _login(client)
    assert login_resp.status_code == 200
    assert login_resp.json()["message"] == "Login successful"
    # httpOnly cookies should be present
    assert "access_token" in login_resp.cookies
    assert "refresh_token" in login_resp.cookies


@pytest.mark.asyncio
async def test_login_sets_user_in_body(client: AsyncClient):
    await _register(client, "bob", "BobPass1!")
    resp = await _login(client, "bob", "BobPass1!")
    assert resp.status_code == 200
    data = resp.json()
    assert "user" in data
    assert data["user"]["username"] == "bob"
    assert data["user"].get("email") in (None, "")


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    await _register(client, "carol", "CarolPass1!")
    resp = await _login(client, "carol", "WrongPass!")
    assert resp.status_code == 401
    from tests.conftest import assert_api_error

    assert_api_error(resp, "INVALID_CREDENTIALS", status=401)


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    resp = await _login(client, "nobody_user_xyz", "AnyPass1!")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_register_missing_fields_returns_422(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={"username": "x"})
    assert resp.status_code == 422


# ─── logout ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_clears_cookies(client: AsyncClient):
    await _register(client, "dave", "DavePass1!")
    login_resp = await _login(client, "dave", "DavePass1!")
    assert login_resp.status_code == 200

    # Use the cookies from login
    logout_resp = await client.post(
        "/api/v1/auth/logout",
        cookies=login_resp.cookies,
    )
    assert logout_resp.status_code == 200
    assert logout_resp.json()["message"] == "Logged out successfully"


@pytest.mark.asyncio
async def test_logout_without_auth_still_succeeds(client: AsyncClient):
    """Logout clears cookies even without a session (stale client cleanup)."""
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["message"] == "Logged out successfully"


# ─── refresh ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_returns_new_access_token(client: AsyncClient):
    await _register(client, "eve", "EvePass1!")
    login_resp = await _login(client, "eve", "EvePass1!")
    assert login_resp.status_code == 200

    refresh_resp = await client.post(
        "/api/v1/auth/refresh",
        cookies=login_resp.cookies,
    )
    assert refresh_resp.status_code == 200
    assert refresh_resp.json()["message"] == "Token refreshed"
    assert "access_token" in refresh_resp.cookies
    assert "refresh_token" in refresh_resp.cookies
    assert refresh_resp.cookies.get("refresh_token") != login_resp.cookies.get("refresh_token")


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(client: AsyncClient):
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


# ─── change-password ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_change_password_success(client: AsyncClient):
    await _register(client, "frank", "FrankPass1!")
    login_resp = await _login(client, "frank", "FrankPass1!")
    assert login_resp.status_code == 200

    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "FrankPass1!", "new_password": "FrankNew1!"},
        cookies=login_resp.cookies,
    )
    assert resp.status_code == 200
    assert resp.json()["message"] == "Password changed successfully"

    # Old password should no longer work
    old_login = await _login(client, "frank", "FrankPass1!")
    assert old_login.status_code == 401

    # New password should work
    new_login = await _login(client, "frank", "FrankNew1!")
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current_returns_400(client: AsyncClient):
    await _register(client, "grace", "GracePass1!")
    login_resp = await _login(client, "grace", "GracePass1!")
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongCurrent1!", "new_password": "GraceNew1!"},
        cookies=login_resp.cookies,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_change_password_returns_user_and_cookies(client: AsyncClient):
    await _register(client, "henry", "HenryPass1!")
    login_resp = await _login(client, "henry", "HenryPass1!")
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "HenryPass1!", "new_password": "HenryNew1!"},
        cookies=login_resp.cookies,
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["username"] == "henry"
    assert "access_token" in resp.cookies
