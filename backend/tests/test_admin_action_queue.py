"""Admin action queue — pending counts and fixture attention filtering."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.fixture import Fixture
from app.models.group import Group, GroupEntryProof, GroupMember
from app.models.user import User
from tests.conftest import register_payload


async def _admin_client(client: AsyncClient, db_session) -> AsyncClient:
    await client.post("/api/v1/auth/register", json=register_payload("admin_queue"))
    login = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin_queue", "password": "SecurePass1"},
    )
    assert login.status_code == 200
    user = (await db_session.execute(select(User).where(User.username == "admin_queue"))).scalar_one()
    user.is_admin = True
    await db_session.commit()
    return client


@pytest.mark.asyncio
async def test_entries_only_counts_users_with_proof(client: AsyncClient, db_session):
    admin = await _admin_client(client, db_session)

    owner = User(username="polla_owner", hashed_password="x", is_active=True)
    db_session.add(owner)
    await db_session.flush()

    group = Group(
        name="Queue Polla",
        owner_id=owner.id,
        invite_code="queuepolla01",
        is_active=True,
        entry_fee=Decimal("10"),
    )
    db_session.add(group)
    await db_session.flush()

    for i in range(3):
        u = User(username=f"no_proof_{i}", hashed_password="x", is_active=True)
        db_session.add(u)
    proof_user = User(username="with_proof", hashed_password="x", is_active=True)
    db_session.add(proof_user)
    await db_session.flush()
    db_session.add(
        GroupEntryProof(group_id=group.id, user_id=proof_user.id, file_path="/tmp/proof.jpg")
    )
    await db_session.commit()

    res = await admin.get("/api/v1/admin/action-queue")
    assert res.status_code == 200
    body = res.json()
    assert body["pending"]["entries"] == 1


@pytest.mark.asyncio
async def test_finished_settled_fixtures_not_in_attention_queue(client: AsyncClient, db_session):
    admin = await _admin_client(client, db_session)

    now = datetime.now(timezone.utc)
    fx = Fixture(
        external_id=99001,
        home_team="Jordan",
        away_team="Argentina",
        league_name="WC",
        league_id=1,
        match_date=now - timedelta(hours=1),
        status="finished",
        season=2026,
        home_score=2,
        away_score=2,
        is_locked=True,
        betting_open=False,
    )
    db_session.add(fx)
    await db_session.commit()

    res = await admin.get("/api/v1/admin/action-queue")
    assert res.status_code == 200
    ids = [f["id"] for f in res.json()["fixtures_attention"]]
    assert str(fx.id) not in ids


@pytest.mark.asyncio
async def test_finished_without_score_still_needs_attention(client: AsyncClient, db_session):
    admin = await _admin_client(client, db_session)

    now = datetime.now(timezone.utc)
    fx = Fixture(
        external_id=99002,
        home_team="Algeria",
        away_team="Austria",
        league_name="WC",
        league_id=1,
        match_date=now - timedelta(hours=1),
        status="finished",
        season=2026,
        home_score=None,
        away_score=None,
        betting_open=False,
    )
    db_session.add(fx)
    await db_session.commit()

    res = await admin.get("/api/v1/admin/action-queue")
    assert res.status_code == 200
    attention = res.json()["fixtures_attention"]
    match = next((f for f in attention if f["id"] == str(fx.id)), None)
    assert match is not None
    assert match["urgency"] == "high"
