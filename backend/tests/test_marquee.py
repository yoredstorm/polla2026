"""Tests for per-competition promotional marquee."""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.competition import Competition, CompetitionAdmin
from app.models.competition_marquee import CompetitionMarquee
from app.models.user import User
from app.services.marquee_service import MARQUEE_MAX_LENGTH, get_competition_marquee, normalize_marquee_message
from tests.conftest import register_payload


async def _register(client: AsyncClient, username: str) -> dict:
    pw = "SecurePass1"
    resp = await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    assert resp.status_code == 201
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": pw},
    )
    assert login.status_code == 200
    return login.cookies


async def _setup_competition(
    db: AsyncSession,
    *,
    slug: str | None = None,
    admin_username: str,
) -> tuple[Competition, User]:
    result = await db.execute(select(User).where(User.username == admin_username))
    admin_user = result.scalar_one()
    comp_slug = slug or f"marquee-cup-{uuid.uuid4().hex[:8]}"
    comp = Competition(
        slug=comp_slug,
        name="Marquee Cup",
        sport="football",
        format_type="league",
        status="open",
        visibility="public",
    )
    db.add(comp)
    await db.flush()
    db.add(CompetitionAdmin(competition_id=comp.id, user_id=admin_user.id, role="owner"))
    await db.flush()
    return comp, admin_user


@pytest.mark.asyncio
async def test_public_competition_marquee_disabled_by_default(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_viewer")
    await db_session.commit()

    comp, _ = await _setup_competition(db_session, admin_username="marquee_viewer")
    await db_session.commit()

    resp = await client.get(f"/api/v1/c/{comp.slug}/marquee", cookies=cookies)
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["message"] == ""
    assert "no-store" in (resp.headers.get("cache-control") or "")


@pytest.mark.asyncio
async def test_competition_admin_update_marquee_creates_audit_log(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_comp_admin")
    await db_session.commit()

    comp, _ = await _setup_competition(db_session, admin_username="marquee_comp_admin")
    await db_session.commit()

    resp = await client.put(
        f"/api/v1/c/{comp.slug}/admin/marquee",
        json={"message": "Promo especial esta semana", "enabled": True},
        cookies=cookies,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is True
    assert body["message"] == "Promo especial esta semana"
    assert body["updated_by_username"] == "marquee_comp_admin"

    public = await client.get(f"/api/v1/c/{comp.slug}/marquee", cookies=cookies)
    assert public.json()["enabled"] is True
    assert public.json()["message"] == "Promo especial esta semana"

    audit = await db_session.execute(
        select(AuditLog).where(AuditLog.action == "admin_marquee_update")
    )
    logs = audit.scalars().all()
    assert len(logs) == 1
    assert logs[0].competition_id == comp.id
    assert "Promo especial esta semana" in (logs[0].detail or "")


@pytest.mark.asyncio
async def test_competition_marquees_are_isolated(
    client: AsyncClient, db_session: AsyncSession
):
    cookies_a = await _register(client, "marquee_admin_a")
    cookies_b = await _register(client, "marquee_admin_b")
    await db_session.commit()

    comp_a, _ = await _setup_competition(
        db_session, slug=f"marquee-cup-a-{uuid.uuid4().hex[:8]}", admin_username="marquee_admin_a"
    )
    comp_b, _ = await _setup_competition(
        db_session, slug=f"marquee-cup-b-{uuid.uuid4().hex[:8]}", admin_username="marquee_admin_b"
    )
    await db_session.commit()

    await client.put(
        f"/api/v1/c/{comp_a.slug}/admin/marquee",
        json={"message": "Solo cup A", "enabled": True},
        cookies=cookies_a,
    )
    await client.put(
        f"/api/v1/c/{comp_b.slug}/admin/marquee",
        json={"message": "Solo cup B", "enabled": True},
        cookies=cookies_b,
    )

    pub_a = await client.get(f"/api/v1/c/{comp_a.slug}/marquee", cookies=cookies_a)
    pub_b = await client.get(f"/api/v1/c/{comp_b.slug}/marquee", cookies=cookies_b)
    assert pub_a.json()["message"] == "Solo cup A"
    assert pub_b.json()["message"] == "Solo cup B"


@pytest.mark.asyncio
async def test_competition_admin_update_logs_even_when_unchanged(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_admin2")
    await db_session.commit()
    comp, _ = await _setup_competition(db_session, admin_username="marquee_admin2")
    await db_session.commit()

    payload = {"message": "Mismo texto", "enabled": True}
    r1 = await client.put(
        f"/api/v1/c/{comp.slug}/admin/marquee", json=payload, cookies=cookies
    )
    assert r1.status_code == 200
    r2 = await client.put(
        f"/api/v1/c/{comp.slug}/admin/marquee", json=payload, cookies=cookies
    )
    assert r2.status_code == 200

    audit = await db_session.execute(
        select(AuditLog).where(
            AuditLog.action == "admin_marquee_update",
            AuditLog.competition_id == comp.id,
        )
    )
    assert len(audit.scalars().all()) == 2


@pytest.mark.asyncio
async def test_competition_admin_marquee_rejects_too_long_message(
    client: AsyncClient, db_session: AsyncSession
):
    cookies = await _register(client, "marquee_admin3")
    await db_session.commit()
    comp, _ = await _setup_competition(db_session, admin_username="marquee_admin3")
    await db_session.commit()

    resp = await client.put(
        f"/api/v1/c/{comp.slug}/admin/marquee",
        json={"message": "x" * (MARQUEE_MAX_LENGTH + 1), "enabled": True},
        cookies=cookies,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_normalize_strips_html_tags():
    assert normalize_marquee_message("  Hola <b>mundo</b>  ") == "Hola mundo"


@pytest.mark.asyncio
async def test_non_admin_cannot_update_competition_marquee(
    client: AsyncClient, db_session: AsyncSession
):
    await _register(client, "marquee_owner")
    cookies_other = await _register(client, "regular_marquee")
    await db_session.commit()
    comp, _ = await _setup_competition(db_session, admin_username="marquee_owner")
    await db_session.commit()

    resp = await client.put(
        f"/api/v1/c/{comp.slug}/admin/marquee",
        json={"message": "Hack", "enabled": True},
        cookies=cookies_other,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_competition_marquee_creates_row(db_session: AsyncSession):
    comp = Competition(
        id=uuid.uuid4(),
        slug="auto-marquee-cup",
        name="Auto",
        sport="football",
        format_type="league",
        status="open",
        visibility="public",
    )
    db_session.add(comp)
    await db_session.flush()

    row = await get_competition_marquee(db_session, comp.id)
    assert row.competition_id == comp.id
    assert row.is_enabled is False

    result = await db_session.execute(
        select(CompetitionMarquee).where(CompetitionMarquee.competition_id == comp.id)
    )
    assert result.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_deprecated_global_marquee_returns_disabled(client: AsyncClient):
    resp = await client.get("/api/v1/site/marquee")
    assert resp.status_code == 200
    body = resp.json()
    assert body["enabled"] is False
    assert body["message"] == ""
