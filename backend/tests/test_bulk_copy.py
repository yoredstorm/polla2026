"""
Integration tests for POST /bets/bulk-copy (profile mass copy).
"""
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bet import Bet
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
async def _register_and_login(client: AsyncClient, username: str = "bulk_user"):
    pw = "BulkPass1!"
    await client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": pw},
    )
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    assert resp.status_code == 200
    return resp.cookies


async def _seed_polla_member(db: AsyncSession, user_id: uuid.UUID) -> tuple[Group, Fixture]:
    existing_groups = await db.execute(select(Group).where(Group.is_active == True))
    for g in existing_groups.scalars().all():
        g.is_active = False

    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Team A",
        away_team="Team B",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test League",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(hours=48),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="Group T",
        venue="Stadium",
        season=2026,
        is_locked=False,
        betting_open=True,
    )
    db.add(fixture)

    group = Group(
        id=uuid.uuid4(),
        name="Test Polla",
        description=None,
        owner_id=user_id,
        invite_code=uuid.uuid4().hex[:12],
        max_members=50,
        entry_fee=Decimal("20"),
        prize_pool=Decimal("0"),
        currency="USD",
        bet_amount_mode="per_bet",
        fixed_bet_amount=Decimal("5.00"),
        is_active=True,
    )
    db.add(group)
    await db.flush()

    db.add(GroupMember(group_id=group.id, user_id=user_id))
    await db.flush()
    return group, fixture


@pytest.mark.asyncio
async def test_bulk_copy_free_and_extra_same_fixture(client: AsyncClient, db_session: AsyncSession):
    """Two items on the same fixture (free + extra) create two bets."""
    cookies = await _register_and_login(client, "bulk_free_extra")

    me_resp = await client.get("/api/v1/users/me", cookies=cookies)
    assert me_resp.status_code == 200
    user_id = uuid.UUID(me_resp.json()["id"])

    group, fixture = await _seed_polla_member(db_session, user_id)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/bets/bulk-copy",
        cookies=cookies,
        json={
            "bets": [
                {
                    "fixture_id": str(fixture.id),
                    "predicted_home_score": 1,
                    "predicted_away_score": 0,
                    "mode": "free",
                },
                {
                    "fixture_id": str(fixture.id),
                    "predicted_home_score": 1,
                    "predicted_away_score": 0,
                    "mode": "extra",
                },
            ]
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["created"] == 2
    assert body["skipped"] == 0
    assert body["errors"] == []

    bets_res = await db_session.execute(
        select(Bet).where(Bet.user_id == user_id, Bet.fixture_id == fixture.id)
    )
    bets = list(bets_res.scalars().all())
    assert len(bets) == 2
    free = [b for b in bets if b.group_id is None]
    extra = [b for b in bets if b.group_id == group.id]
    assert len(free) == 1
    assert len(extra) == 1
    assert extra[0].amount == Decimal("5.00")


@pytest.mark.asyncio
async def test_bulk_copy_extra_only_does_not_create_free(client: AsyncClient, db_session: AsyncSession):
    """Extra-only line must not create a collateral free bet."""
    cookies = await _register_and_login(client, "bulk_extra_only")

    me_resp = await client.get("/api/v1/users/me", cookies=cookies)
    user_id = uuid.UUID(me_resp.json()["id"])

    group, fixture = await _seed_polla_member(db_session, user_id)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/bets/bulk-copy",
        cookies=cookies,
        json={
            "bets": [
                {
                    "fixture_id": str(fixture.id),
                    "predicted_home_score": 2,
                    "predicted_away_score": 1,
                    "mode": "extra",
                },
            ]
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["created"] == 1
    assert body["errors"] == []

    bets_res = await db_session.execute(
        select(Bet).where(Bet.user_id == user_id, Bet.fixture_id == fixture.id)
    )
    bets = list(bets_res.scalars().all())
    assert len(bets) == 1
    assert bets[0].group_id == group.id
    assert bets[0].group_id is not None
