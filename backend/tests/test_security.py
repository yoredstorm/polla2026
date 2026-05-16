"""
Security checklist tests (tokens in transit, admin RBAC, response hygiene).
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.user import User


async def _register(client: AsyncClient, username: str, password: str = "SecurePass1!"):
    return await client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password},
    )


async def _login(client: AsyncClient, username: str, password: str = "SecurePass1!"):
    return await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


@pytest.mark.asyncio
async def test_login_sets_httponly_cookies_not_body_tokens(client: AsyncClient):
    await _register(client, "sec_user1")
    resp = await _login(client, "sec_user1")
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" not in body
    assert "refresh_token" not in body
    set_cookie = resp.headers.get_list("set-cookie") if hasattr(resp.headers, "get_list") else [resp.headers.get("set-cookie", "")]
    combined = " ".join(set_cookie)
    assert "httponly" in combined.lower()
    assert "access_token" in resp.cookies
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_non_admin_forbidden_on_admin_stats(client: AsyncClient, db_session):
    await _register(client, "sec_user2")
    login = await _login(client, "sec_user2")
    assert login.status_code == 200

    stats = await client.get("/api/v1/admin/stats", cookies=login.cookies)
    assert stats.status_code == 403
    assert stats.json()["detail"]["error"]["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_admin_can_access_stats(client: AsyncClient, db_session):
    await _register(client, "sec_admin")
    result = await db_session.execute(select(User).where(User.username == "sec_admin"))
    user = result.scalar_one()
    user.is_admin = True
    await db_session.flush()

    login = await _login(client, "sec_admin")
    stats = await client.get("/api/v1/admin/stats", cookies=login.cookies)
    assert stats.status_code == 200


@pytest.mark.asyncio
async def test_refresh_rotates_refresh_cookie(client: AsyncClient):
    await _register(client, "sec_user3")
    login = await _login(client, "sec_user3")
    old_refresh = login.cookies.get("refresh_token")

    refreshed = await client.post("/api/v1/auth/refresh", cookies=login.cookies)
    assert refreshed.status_code == 200
    new_refresh = refreshed.cookies.get("refresh_token")
    assert new_refresh
    assert new_refresh != old_refresh

    reuse = await client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": old_refresh},
    )
    assert reuse.status_code == 401
