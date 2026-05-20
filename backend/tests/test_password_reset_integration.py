"""Password reset request flow: user request → admin resolve → forced change."""
import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _noop_notifications(monkeypatch):
    async def _noop(*_args, **_kwargs):
        return []

    monkeypatch.setattr("app.api.v1.auth.notify_admins", _noop)
    monkeypatch.setattr("app.api.v1.admin.resolve_actionable_notifications", _noop)


from httpx import AsyncClient
from sqlalchemy import select

from app.models.password_reset_request import PasswordResetRequest
from app.models.user import User
from tests.conftest import register_payload


async def _register(client: AsyncClient, username: str, password: str = "SecurePass1"):
    return await client.post(
        "/api/v1/auth/register",
        json=register_payload(username, password=password),
    )


async def _login(client: AsyncClient, username: str, password: str = "SecurePass1"):
    return await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )


async def _make_admin(db_session, username: str) -> User:
    result = await db_session.execute(select(User).where(User.username == username))
    user = result.scalar_one()
    user.is_admin = True
    await db_session.flush()
    return user


async def test_password_reset_request_generic_response(client: AsyncClient, db_session):
    await _register(client, "pwd_user1")
    resp = await client.post(
        "/api/v1/auth/password-reset-request",
        json={"username": "pwd_user1", "message": "Olvidé mi clave"},
    )
    assert resp.status_code == 200
    assert "administrador" in resp.json()["message"].lower()

    result = await db_session.execute(
        select(PasswordResetRequest).where(PasswordResetRequest.status == "pending")
    )
    assert result.scalar_one_or_none() is not None

    unknown = await client.post(
        "/api/v1/auth/password-reset-request",
        json={"username": "no_such_user_xyz"},
    )
    assert unknown.status_code == 200


async def test_password_reset_full_flow(client: AsyncClient, db_session):
    await _register(client, "pwd_user2", "OldPass1!")
    await _register(client, "pwd_admin")
    await _make_admin(db_session, "pwd_admin")
    admin_login = await _login(client, "pwd_admin")

    req_resp = await client.post(
        "/api/v1/auth/password-reset-request",
        json={"username": "pwd_user2"},
    )
    assert req_resp.status_code == 200

    list_resp = await client.get(
        "/api/v1/admin/password-reset-requests",
        params={"status": "pending"},
        cookies=admin_login.cookies,
    )
    assert list_resp.status_code == 200
    rows = list_resp.json()["data"]
    assert len(rows) == 1
    request_id = rows[0]["id"]

    resolve_resp = await client.post(
        f"/api/v1/admin/password-reset-requests/{request_id}/resolve",
        json={},
        cookies=admin_login.cookies,
    )
    assert resolve_resp.status_code == 200
    temp_password = resolve_resp.json()["temporary_password"]
    assert len(temp_password) >= 8

    user_res = await db_session.execute(select(User).where(User.username == "pwd_user2"))
    user = user_res.scalar_one()
    assert user.must_change_password is True

    login_resp = await _login(client, "pwd_user2", temp_password)
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["must_change_password"] is True

    change_resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": temp_password, "new_password": "NewSecure1"},
        cookies=login_resp.cookies,
    )
    assert change_resp.status_code == 200
    assert change_resp.json()["user"]["must_change_password"] is False
    assert "access_token" in change_resp.cookies

    await db_session.refresh(user)
    assert user.must_change_password is False

    old_login = await _login(client, "pwd_user2", temp_password)
    assert old_login.status_code == 401

    new_login = await _login(client, "pwd_user2", "NewSecure1")
    assert new_login.status_code == 200
    assert new_login.json()["user"]["must_change_password"] is False


async def test_duplicate_pending_request_not_created(client: AsyncClient, db_session):
    await _register(client, "pwd_user3")
    await client.post("/api/v1/auth/password-reset-request", json={"username": "pwd_user3"})
    await client.post("/api/v1/auth/password-reset-request", json={"username": "pwd_user3"})

    result = await db_session.execute(
        select(PasswordResetRequest).where(
            PasswordResetRequest.status == "pending",
        )
    )
    pending = result.scalars().all()
    assert len(pending) == 1
