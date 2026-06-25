"""Phase winner badges after close_phase."""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.group_phase import GroupPhaseEnrollment
from app.models.user import User
from app.services.gamification_service import compute_badges
from app.services.phase_enrollment_service import seed_phase_fees_for_group
from app.services.tournament_phase_service import close_phase


def _fixture(external_id: int, *, group_name=None, status="finished"):
    return Fixture(
        external_id=external_id,
        home_team="A",
        away_team="B",
        league_name="WC",
        league_id=1,
        match_date=datetime(2026, 6, 11, tzinfo=timezone.utc),
        status=status,
        season=2026,
        group_name=group_name,
        home_score=1 if status == "finished" else None,
        away_score=0 if status == "finished" else None,
    )


@pytest.mark.asyncio
async def test_groups_phase_winner_badge_after_close(db_session):
    winner = User(username="badge_winner", hashed_password="x")
    loser = User(username="badge_loser", hashed_password="x")
    db_session.add_all([winner, loser])
    await db_session.flush()

    group = Group(
        name="Badge Polla",
        owner_id=winner.id,
        invite_code="badgepoll01",
        prize_structure_mode="groups_knockout",
        current_phase_key="groups",
        is_active=True,
        prize_pool=Decimal("20"),
    )
    db_session.add(group)
    await db_session.flush()
    await seed_phase_fees_for_group(db_session, group)

    db_session.add_all(
        [
            GroupMember(group_id=group.id, user_id=winner.id, total_points=30),
            GroupMember(group_id=group.id, user_id=loser.id, total_points=10),
        ]
    )
    for uid in (winner.id, loser.id):
        db_session.add(
            GroupPhaseEnrollment(
                group_id=group.id,
                user_id=uid,
                phase_key="groups",
                status="confirmed",
                entry_fee_paid=Decimal("10"),
            )
        )
    db_session.add(_fixture(1001, group_name="Group A"))
    await db_session.flush()

    record = await close_phase(db_session, group, "groups")
    assert record is not None
    assert record.winner_user_id == winner.id

    winner_badges = await compute_badges(db_session, winner.id, group_id=group.id)
    loser_badges = await compute_badges(db_session, loser.id, group_id=group.id)

    assert any(b["id"] == "groups_phase_winner" for b in winner_badges)
    assert not any(b["id"] == "groups_phase_winner" for b in loser_badges)
