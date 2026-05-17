"""Tests for 1v1 challenges (Te reto)."""
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
from app.models.user import User
from app.models.challenge import Challenge
from app.services.challenge_service import (
    accept_challenge,
    create_challenge,
    available_points,
    compute_challenge_stats,
    settle_challenges_for_fixture,
)
from app.services.gamification_service import compute_badges
from app.services.bet_service import settle_fixture_bets


async def _register(client: AsyncClient, username: str) -> tuple:
    pw = "Challenge1!"
    await client.post("/api/v1/auth/register", json={"username": username, "password": pw})
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": pw})
    assert resp.status_code == 200
    me = await client.get("/api/v1/users/me", cookies=resp.cookies)
    return resp.cookies, uuid.UUID(me.json()["id"])


async def _seed_polla(
    db: AsyncSession,
    members: list[tuple[uuid.UUID, int]],
    *,
    challenge_max_stake: int = 10,
) -> tuple[Group, Fixture]:
    for g in (await db.execute(select(Group).where(Group.is_active == True))).scalars().all():
        g.is_active = False

    owner_id = members[0][0]
    fixture = Fixture(
        id=uuid.uuid4(),
        external_id=int(uuid.uuid4().int % 2_000_000_000),
        home_team="Home",
        away_team="Away",
        home_logo_url=None,
        away_logo_url=None,
        league_name="Test",
        league_id=1,
        league_logo_url=None,
        match_date=datetime.now(timezone.utc) + timedelta(hours=48),
        status="scheduled",
        home_score=None,
        away_score=None,
        round="R1",
        group_name="G",
        venue="V",
        season=2026,
        is_locked=False,
        betting_open=True,
    )
    db.add(fixture)

    group = Group(
        id=uuid.uuid4(),
        name="Challenge Polla",
        description=None,
        owner_id=owner_id,
        invite_code=uuid.uuid4().hex[:12],
        max_members=50,
        entry_fee=Decimal("10"),
        prize_pool=Decimal("0"),
        currency="USD",
        bet_amount_mode="per_bet",
        fixed_bet_amount=Decimal("5"),
        is_active=True,
        challenge_max_stake=challenge_max_stake,
    )
    db.add(group)
    await db.flush()

    for user_id, points in members:
        db.add(
            GroupMember(
                group_id=group.id,
                user_id=user_id,
                total_points=points,
            )
        )
    await db.flush()
    return group, fixture


def _bet(
    user_id: uuid.UUID,
    fixture_id: uuid.UUID,
    group_id: uuid.UUID,
    home: int = 1,
    away: int = 0,
) -> Bet:
    return Bet(
        id=uuid.uuid4(),
        user_id=user_id,
        fixture_id=fixture_id,
        group_id=group_id,
        predicted_home_score=home,
        predicted_away_score=away,
        amount=Decimal("0"),
        amount_confirmed=True,
    )


@pytest.mark.asyncio
async def test_accept_succeeds_when_challenger_at_stake_limit(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Challenger with exactly enough points can create and challenged can accept."""
    cookies_a, user_a = await _register(client, "challenger4")
    cookies_b, user_b = await _register(client, "challenged6")

    group, fixture = await _seed_polla(
        db_session,
        [(user_a, 4), (user_b, 6)],
    )
    db_session.add(_bet(user_a, fixture.id, group.id))
    db_session.add(_bet(user_b, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (
        await db_session.execute(select(User).where(User.id == user_b))
    ).scalar_one()

    ch = await create_challenge(
        db_session,
        None,
        challenger_id=user_a,
        challenged_username=user_b_row.username,
        fixture_id=fixture.id,
        stake_points=2,
        ip=None,
    )
    await db_session.commit()

    accepted = await accept_challenge(
        db_session,
        None,
        challenge_id=ch.id,
        user_id=user_b,
        ip=None,
    )
    await db_session.commit()
    assert accepted.status == "active"


@pytest.mark.asyncio
async def test_accept_fails_without_bet(client: AsyncClient, db_session: AsyncSession):
    cookies_a, user_a = await _register(client, "challenger_nb")
    cookies_b, user_b = await _register(client, "challenged_nb")

    group, fixture = await _seed_polla(db_session, [(user_a, 10), (user_b, 10)])
    db_session.add(_bet(user_a, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    ch = await create_challenge(
        db_session,
        None,
        challenger_id=user_a,
        challenged_username=user_b_row.username,
        fixture_id=fixture.id,
        stake_points=2,
        ip=None,
    )
    await db_session.commit()

    with pytest.raises(ValueError, match="BOTH_NEED_BET"):
        await accept_challenge(
            db_session,
            None,
            challenge_id=ch.id,
            user_id=user_b,
            ip=None,
        )


@pytest.mark.asyncio
async def test_create_fails_when_opponent_lacks_points(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cookies_a, user_a = await _register(client, "challenger_op")
    cookies_b, user_b = await _register(client, "challenged_op")

    group, fixture = await _seed_polla(db_session, [(user_a, 10), (user_b, 2)])
    db_session.add(_bet(user_a, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    with pytest.raises(ValueError, match="OPPONENT_INSUFFICIENT_POINTS"):
        await create_challenge(
            db_session,
            None,
            challenger_id=user_a,
            challenged_username=user_b_row.username,
            fixture_id=fixture.id,
            stake_points=3,
            ip=None,
        )


@pytest.mark.asyncio
async def test_opponents_endpoint(client: AsyncClient, db_session: AsyncSession):
    cookies_a, user_a = await _register(client, "search_a")
    cookies_b, user_b = await _register(client, "lcamacho_b")

    await _seed_polla(db_session, [(user_a, 5), (user_b, 8)])
    await db_session.commit()

    resp = await client.get(
        "/api/v1/challenges/opponents",
        params={"q": "lcam"},
        cookies=cookies_a,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["username"] == "lcamacho_b"
    assert data[0]["available_for_challenge"] == 8


@pytest.mark.asyncio
async def test_pending_does_not_reduce_challenged_available(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cookies_a, user_a = await _register(client, "avail_a")
    cookies_b, user_b = await _register(client, "avail_b")

    group, fixture = await _seed_polla(db_session, [(user_a, 4), (user_b, 6)])
    db_session.add(_bet(user_a, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    await create_challenge(
        db_session,
        None,
        challenger_id=user_a,
        challenged_username=user_b_row.username,
        fixture_id=fixture.id,
        stake_points=2,
        ip=None,
    )
    await db_session.commit()

    avail_b = await available_points(db_session, user_b, group.id)
    assert avail_b == 6


@pytest.mark.asyncio
async def test_loser_does_not_keep_fixture_bet_points_on_ranking(
    client: AsyncClient,
    db_session: AsyncSession,
):
    """Winner gets stake + fixture pts; loser keeps only unstaked balance (50% cap on stake)."""
    cookies_a, user_a = await _register(client, "duel_winner")
    cookies_b, user_b = await _register(client, "duel_loser")

    group, fixture = await _seed_polla(db_session, [(user_a, 6), (user_b, 6)])
    db_session.add(_bet(user_a, fixture.id, group.id, 1, 0))
    db_session.add(_bet(user_b, fixture.id, group.id, 0, 2))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    ch = await create_challenge(
        db_session,
        None,
        challenger_id=user_a,
        challenged_username=user_b_row.username,
        fixture_id=fixture.id,
        stake_points=3,
        ip=None,
    )
    await accept_challenge(db_session, None, challenge_id=ch.id, user_id=user_b, ip=None)
    await db_session.commit()

    fixture.status = "finished"
    fixture.home_score = 1
    fixture.away_score = 0
    await db_session.flush()

    await settle_fixture_bets(db_session, fixture)
    await settle_challenges_for_fixture(db_session, None, fixture)
    await db_session.commit()

    ma = (
        await db_session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group.id, GroupMember.user_id == user_a
            )
        )
    ).scalar_one()
    mb = (
        await db_session.execute(
            select(GroupMember).where(
                GroupMember.group_id == group.id, GroupMember.user_id == user_b
            )
        )
    ).scalar_one()

    assert ma.total_points == 11
    assert mb.total_points == 3


@pytest.mark.asyncio
async def test_create_fails_stake_above_group_max(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cookies_a, user_a = await _register(client, "stake_max_a")
    cookies_b, user_b = await _register(client, "stake_max_b")

    group, fixture = await _seed_polla(
        db_session,
        [(user_a, 10), (user_b, 10)],
        challenge_max_stake=3,
    )
    db_session.add(_bet(user_a, fixture.id, group.id))
    db_session.add(_bet(user_b, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    with pytest.raises(ValueError, match="STAKE_ABOVE_MAX"):
        await create_challenge(
            db_session,
            None,
            challenger_id=user_a,
            challenged_username=user_b_row.username,
            fixture_id=fixture.id,
            stake_points=6,
            ip=None,
        )


@pytest.mark.asyncio
async def test_create_fails_stake_above_half_balance(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cookies_a, user_a = await _register(client, "half_a")
    cookies_b, user_b = await _register(client, "half_b")

    group, fixture = await _seed_polla(db_session, [(user_a, 8), (user_b, 10)])
    db_session.add(_bet(user_a, fixture.id, group.id))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    with pytest.raises(ValueError, match="STAKE_ABOVE_HALF_BALANCE"):
        await create_challenge(
            db_session,
            None,
            challenger_id=user_a,
            challenged_username=user_b_row.username,
            fixture_id=fixture.id,
            stake_points=5,
            ip=None,
        )


@pytest.mark.asyncio
async def test_challenge_stats_after_settle(
    client: AsyncClient,
    db_session: AsyncSession,
):
    cookies_a, user_a = await _register(client, "stats_w")
    cookies_b, user_b = await _register(client, "stats_l")

    group, fixture = await _seed_polla(db_session, [(user_a, 6), (user_b, 6)])
    db_session.add(_bet(user_a, fixture.id, group.id, 1, 0))
    db_session.add(_bet(user_b, fixture.id, group.id, 0, 2))
    await db_session.commit()

    user_b_row = (await db_session.execute(select(User).where(User.id == user_b))).scalar_one()

    ch = await create_challenge(
        db_session,
        None,
        challenger_id=user_a,
        challenged_username=user_b_row.username,
        fixture_id=fixture.id,
        stake_points=3,
        ip=None,
    )
    await accept_challenge(db_session, None, challenge_id=ch.id, user_id=user_b, ip=None)
    await db_session.commit()

    fixture.status = "finished"
    fixture.home_score = 1
    fixture.away_score = 0
    await db_session.flush()
    await settle_fixture_bets(db_session, fixture)
    await settle_challenges_for_fixture(db_session, None, fixture)
    await db_session.commit()

    w = await compute_challenge_stats(db_session, user_a, group.id)
    l = await compute_challenge_stats(db_session, user_b, group.id)
    assert w["challenges_won"] == 1
    assert w["challenge_pts_won"] == 3
    assert w["challenge_pts_net"] == 3
    assert l["challenges_lost"] == 1
    assert l["challenge_pts_lost"] == 3
    assert l["challenge_pts_net"] == -3


@pytest.mark.asyncio
async def test_hat_trick_badge(client: AsyncClient, db_session: AsyncSession):
    cookies_a, user_a = await _register(client, "badge_w")
    cookies_b, user_b = await _register(client, "badge_l")

    group, fixture = await _seed_polla(db_session, [(user_a, 10), (user_b, 10)])
    base = datetime.now(timezone.utc)
    for i in range(3):
        db_session.add(
            Challenge(
                id=uuid.uuid4(),
                fixture_id=fixture.id,
                group_id=group.id,
                challenger_id=user_a,
                challenged_id=user_b,
                stake_points=1,
                status="settled",
                winner_id=user_a,
                settled_at=base + timedelta(minutes=i),
            )
        )
    await db_session.commit()

    badges = await compute_badges(db_session, user_a, group_id=group.id)
    ids = {b["id"] for b in badges}
    assert "hat_trick" in ids
    assert "challenge_king" in ids
