"""Tests for site promotional marquee."""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.site_marquee import MARQUEE_SINGLETON_ID, SiteMarquee
from app.models.user import User
from app.services.marquee_service import MARQUEE_MAX_LENGTH, normalize_marquee_message
from tests.conftest import register_payload


async def _register(client: AsyncClient, username: str) -> dict:
    resp = await client.post("/api/v1/auth/register", json=register_payload(username))
    assert resp.status_code == 201
    return resp.cookies


async def _make_admin(db: AsyncSession, username: str) -> User:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one()
    user.is_admin = True
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_public_marquee_disabled_by_default(client: AsyncClient):
    resp = await client.get("/api/v1/site/marquee")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["message"] == ""
    assert "no-store" in (resp.headers.get("cache-control") or "")


@pytest.mark.asyncio
async def test_admin_update_marquee_creates_audit_log(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_admin")
    await _make_admin(db_session, "marquee_admin")
    await db_session.commit()

    resp = await client.put(
        "/api/v1/admin/marquee",
        json={"message": "Promo especial esta semana", "enabled": True},
        cookies=cookies,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["message"] == "Promo especial esta semana"
    assert body["updated_by_username"] == "marquee_admin"

    public = await client.get("/api/v1/site/marquee")
    assert public.json()["enabled"] is True
    assert public.json()["message"] == "Promo especial esta semana"

    audit = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "admin_marquee_update")
    )
    logs = audit.scalars().all()
    assert len(logs) == 1
    assert "Promo especial esta semana" in (logs[0].detail or "")


@pytest.mark.asyncio
async def test_admin_update_logs_even_when_unchanged(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_admin2")
    await _make_admin(db_session, "marquee_admin2")
    await db_session.commit()

    payload = {"message": "Mismo texto", "enabled": True}
    r1 = await client.put("/api/v1/admin/marquee", json=payload, cookies=cookies)
    assert r1.status_code == 200
    r2 = await client.put("/api/v1/admin/marquee", json=payload, cookies=cookies)
    assert r2.status_code == 200

    audit = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "admin_marquee_update")
    )
    assert len(audit.scalars().all()) == 2


@pytest.mark.asyncio
async def test_admin_marquee_rejects_too_long_message(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_admin3")
    await _make_admin(db_session, "marquee_admin3")
    await db_session.commit()

    resp = await client.put(
        "/api/v1/admin/marquee",
        json={"message": "x" * (MARQUEE_MAX_LENGTH + 1), "enabled": True},
        cookies=cookies,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_normalize_strips_html_tags():
    assert normalize_marquee_message("  Hola <b>mundo</b>  ") == "Hola mundo"


@pytest.mark.asyncio
async def test_non_admin_cannot_update_marquee(client: AsyncClient):
    cookies = await _register(client, "regular_marquee")
    resp = await client.put(
        "/api/v1/admin/marquee",
        json={"message": "Hack", "enabled": True},
        cookies=cookies,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_marquee_creates_singleton(db_session: AsyncSession):
    from app.services.marquee_service import get_marquee

    row = await get_marquee(db_session)
    assert row.id == MARQUEE_SINGLETON_ID
    assert row.is_enabled is False

    result = await db_session.execute(
        select(SiteMarquee).where(SiteMarquee.id == MARQUEE_SINGLETON_ID)
    )
    assert result.scalar_one_or_none() is not None
