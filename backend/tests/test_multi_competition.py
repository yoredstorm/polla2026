"""Multi-competition platform tests."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.competition import Competition, CompetitionAdmin, ScoringRule
from app.models.fixture import Fixture
from app.models.group import Group
from app.models.user import User
from app.services.competition_admin_service import create_competition
from app.services.competition_service import get_competition_by_slug, get_group_for_competition, user_is_competition_admin
from app.schemas.competition import CompetitionCreateIn
from tests.conftest import register_payload

pytestmark = pytest.mark.asyncio


async def _register(client: AsyncClient, username: str) -> None:
    pw = "MultiComp1!"
    await client.post("/api/v1/auth/register", json=register_payload(username, password=pw))
    await client.post("/api/v1/auth/login", json={"username": username, "password": pw})


async def _make_super_admin(db: AsyncSession, username: str) -> User:
    user = (await db.execute(select(User).where(User.username == username))).scalar_one()
    user.is_admin = True
    await db.flush()
    return user


async def test_create_competition_and_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _register(client, "super_mc")
    await _make_super_admin(db_session, "super_mc")
    await db_session.commit()

    resp = await client.post(
        "/api/v1/competitions",
        json={
            "slug": "liga-1-peru-2026",
            "name": "Liga 1 Perú 2026",
            "format_type": "league",
            "status": "open",
            "visibility": "public",
        },
    )
    assert resp.status_code == 201
    comp_id = resp.json()["id"]

    await _register(client, "liga_admin")
    admin_user = (
        await db_session.execute(select(User).where(User.username == "liga_admin"))
    ).scalar_one()
    db_session.add(
        CompetitionAdmin(competition_id=uuid.UUID(comp_id), user_id=admin_user.id, role="owner")
    )
    await db_session.commit()

    comp = await get_competition_by_slug(db_session, "liga-1-peru-2026")
    assert comp is not None
    assert await user_is_competition_admin(db_session, admin_user, comp.id)
    assert not await user_is_competition_admin(db_session, admin_user, uuid.uuid4())


async def test_draft_competition_hidden_from_discover(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _register(client, "discover_user")
    comp = Competition(
        slug="draft-only-cup",
        name="Draft Cup",
        sport="football",
        format_type="league",
        status="draft",
        visibility="public",
    )
    db_session.add(comp)
    await db_session.commit()

    resp = await client.get("/api/v1/competitions/discover")
    assert resp.status_code == 200
    slugs = [c["slug"] for c in resp.json()]
    assert "draft-only-cup" not in slugs


async def test_scoring_rules_defaults_on_create(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _register(client, "score_super")
    await _make_super_admin(db_session, "score_super")
    await db_session.commit()

    resp = await client.post(
        "/api/v1/competitions",
        json={"slug": "scoring-test", "name": "Scoring Test", "status": "open"},
    )
    assert resp.status_code == 201
    comp_id = uuid.UUID(resp.json()["id"])
    rule = (
        await db_session.execute(select(ScoringRule).where(ScoringRule.competition_id == comp_id))
    ).scalar_one()
    assert rule.exact_score_points == 2
    assert rule.winner_points == 1


async def test_csv_import_dry_run(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _register(client, "import_admin")
    admin = await _make_super_admin(db_session, "import_admin")
    body = CompetitionCreateIn(slug="import-cup", name="Import Cup", status="open")
    comp = await create_competition(db_session, body, admin)
    await db_session.commit()

    csv_content = (
        "external_id,date,time,team1,team2,round,ground,group\n"
        "1,2026-07-01,15:00 UTC+0,Team X,Team Y,Jornada 1,Stadium A,\n"
    )
    files = {"file": ("fixtures.csv", csv_content, "text/csv")}
    resp = await client.post(
        f"/api/v1/c/{comp.slug}/admin/fixtures/import?dry_run=true",
        files=files,
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["count"] == 1


async def test_competition_admin_cannot_import_other_competition(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Competition admin of cup A gets 403 importing into cup B."""
    await _register(client, "super_iso")
    await _make_super_admin(db_session, "super_iso")
    await db_session.commit()

    resp_a = await client.post(
        "/api/v1/competitions",
        json={"slug": "cup-a", "name": "Cup A", "status": "open"},
    )
    resp_b = await client.post(
        "/api/v1/competitions",
        json={"slug": "cup-b", "name": "Cup B", "status": "open"},
    )
    assert resp_a.status_code == 201
    assert resp_b.status_code == 201

    await _register(client, "admin_a_only")
    admin_a = (
        await db_session.execute(select(User).where(User.username == "admin_a_only"))
    ).scalar_one()
    comp_a = await get_competition_by_slug(db_session, "cup-a")
    assert comp_a is not None
    db_session.add(
        CompetitionAdmin(competition_id=comp_a.id, user_id=admin_a.id, role="owner")
    )
    await db_session.commit()

    csv_content = (
        "external_id,date,time,team1,team2,round,ground,group\n"
        "1,2026-07-01,15:00 UTC+0,X,Y,J1,Stadium,\n"
    )
    files = {"file": ("fixtures.csv", csv_content, "text/csv")}
    resp = await client.post(
        "/api/v1/c/cup-b/admin/fixtures/import?dry_run=true",
        files=files,
    )
    assert resp.status_code == 403


async def _setup_cups_with_admin(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    super_username: str | None = None,
    comp_admin_username: str | None = None,
):
    suffix = uuid.uuid4().hex[:8]
    super_username = super_username or f"rbac_super_{suffix}"
    comp_admin_username = comp_admin_username or f"rbac_comp_admin_{suffix}"
    slug_a = f"cup-a-{suffix}"
    slug_b = f"cup-b-{suffix}"

    await _register(client, super_username)
    await _make_super_admin(db_session, super_username)
    await db_session.commit()

    for slug, name in ((slug_a, "Cup A"), (slug_b, "Cup B")):
        resp = await client.post(
            "/api/v1/competitions",
            json={"slug": slug, "name": name, "status": "open"},
        )
        assert resp.status_code == 201, resp.text

    await _register(client, comp_admin_username)
    comp_admin = (
        await db_session.execute(select(User).where(User.username == comp_admin_username))
    ).scalar_one()
    comp_a = await get_competition_by_slug(db_session, slug_a)
    assert comp_a is not None
    db_session.add(
        CompetitionAdmin(competition_id=comp_a.id, user_id=comp_admin.id, role="owner")
    )
    await db_session.commit()

    await client.post(
        "/api/v1/auth/login",
        json={"username": comp_admin_username, "password": "MultiComp1!"},
    )
    return comp_admin, comp_a, slug_a, slug_b, super_username


async def test_competition_admin_scoped_action_queue_cross_competition(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, slug_a, slug_b, _ = await _setup_cups_with_admin(client, db_session)

    ok = await client.get(f"/api/v1/c/{slug_a}/admin/action-queue")
    assert ok.status_code == 200

    forbidden = await client.get(f"/api/v1/c/{slug_b}/admin/action-queue")
    assert forbidden.status_code == 403


async def test_competition_admin_forbidden_on_global_admin_and_list_all(
    client: AsyncClient,
    db_session: AsyncSession,
):
    await _setup_cups_with_admin(client, db_session)

    assert (await client.get("/api/v1/admin/action-queue")).status_code == 403
    assert (await client.get("/api/v1/competitions")).status_code == 403


async def test_competition_admin_administered_list(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, slug_a, _, _ = await _setup_cups_with_admin(client, db_session)

    resp = await client.get("/api/v1/competitions/administered")
    assert resp.status_code == 200
    slugs = [c["slug"] for c in resp.json()]
    assert slugs == [slug_a]


async def test_super_admin_list_all_and_context_bypass(
    client: AsyncClient,
    db_session: AsyncSession,
):
    _, _, _, slug_b, super_username = await _setup_cups_with_admin(client, db_session)

    await client.post(
        "/api/v1/auth/login",
        json={"username": super_username, "password": "MultiComp1!"},
    )

    all_resp = await client.get("/api/v1/competitions")
    assert all_resp.status_code == 200
    slugs = {c["slug"] for c in all_resp.json()}
    assert slug_b in slugs

    ctx = await client.get(f"/api/v1/c/{slug_b}/context")
    assert ctx.status_code == 200
    body = ctx.json()
    assert body["is_admin"] is True
    assert body["is_member"] is False

    scoped = await client.get(f"/api/v1/c/{slug_b}/admin/action-queue")
    assert scoped.status_code == 200


async def test_competition_audit_log_includes_legacy_rows(
    client: AsyncClient,
    db_session: AsyncSession,
):
    from app.models.audit_log import AuditLog
    from app.services.audit import log_action

    _, _, slug_a, _, super_username = await _setup_cups_with_admin(client, db_session)
    comp_a = await get_competition_by_slug(db_session, slug_a)
    assert comp_a is not None
    group = await get_group_for_competition(db_session, comp_a.id)

    await log_action(
        db_session,
        user_id=None,
        action="admin_settle",
        detail={"fixture_id": str(uuid.uuid4()), "group_id": str(group.id) if group else "x"},
    )
    await db_session.commit()

    await client.post(
        "/api/v1/auth/login",
        json={"username": super_username, "password": "MultiComp1!"},
    )
    resp = await client.get(f"/api/v1/c/{slug_a}/admin/audit-log")
    assert resp.status_code == 200
    assert resp.json()["pagination"]["total"] >= 1


async def test_super_admin_assigns_competition_admin(
    client: AsyncClient,
    db_session: AsyncSession,
):
    new_admin_name = f"rbac_new_admin_{uuid.uuid4().hex[:8]}"
    _, _, _, slug_b, super_username = await _setup_cups_with_admin(client, db_session)

    await _register(client, new_admin_name)
    new_admin = (
        await db_session.execute(select(User).where(User.username == new_admin_name))
    ).scalar_one()
    comp_b = await get_competition_by_slug(db_session, slug_b)
    assert comp_b is not None

    await client.post(
        "/api/v1/auth/login",
        json={"username": super_username, "password": "MultiComp1!"},
    )
    assign = await client.post(
        f"/api/v1/competitions/{comp_b.id}/admins",
        json={"user_id": str(new_admin.id), "role": "co_admin"},
    )
    assert assign.status_code == 201

    await client.post(
        "/api/v1/auth/login",
        json={"username": new_admin_name, "password": "MultiComp1!"},
    )
    ctx = await client.get(f"/api/v1/c/{slug_b}/context")
    assert ctx.status_code == 200
    assert ctx.json()["is_admin"] is True

