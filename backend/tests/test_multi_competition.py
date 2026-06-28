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
from app.services.competition_service import get_competition_by_slug, user_is_competition_admin
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
