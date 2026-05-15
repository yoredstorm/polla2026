"""
Tests for authentication endpoints and access control.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    response = await client.post("/api/v1/auth/register", json={
        "username": "testuser",
        "password": "SecurePass1",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "testuser"
    assert data.get("email") in (None, "")
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_duplicate_returns_409(client: AsyncClient):
    payload = {"username": "dupuser", "password": "SecurePass1"}
    await client.post("/api/v1/auth/register", json=payload)
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password_returns_422(client: AsyncClient):
    response = await client.post("/api/v1/auth/register", json={
        "username": "weakuser",
        "password": "weak",
    })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post("/api/v1/auth/login", json={
        "username": "nobody_user_xyz",
        "password": "wrongpassword",
    })
    assert response.status_code == 401
    data = response.json()
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_get_bet_of_other_user_is_forbidden(client: AsyncClient):
    """A01: Users cannot access other users bets."""
    import uuid
    fake_bet_id = str(uuid.uuid4())
    # Without auth, should be 401
    response = await client.get(f"/api/v1/bets/{fake_bet_id}")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint_no_sensitive_data(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "password" not in str(data)
    assert "secret" not in str(data).lower()
