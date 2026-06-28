"""Competition resolution, access control, and helpers."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.competition import (
    Competition,
    CompetitionAdmin,
    ScoringRule,
    PrizeDistribution,
    PaymentSetting,
)
from app.models.group import Group, GroupMember
from app.models.user import User

DEFAULT_COMPETITION_SLUG = "mundial-2026"
HIDDEN_STATUSES = frozenset({"draft", "archived"})
DISCOVER_STATUSES = frozenset({"scheduled", "open", "in_progress", "finished"})


@dataclass
class ScoringPoints:
    exact: int = 2
    winner: int = 1
    wrong: int = 0


async def get_competition_by_slug(db: AsyncSession, slug: str) -> Competition | None:
    result = await db.execute(select(Competition).where(Competition.slug == slug.strip().lower()))
    return result.scalar_one_or_none()


async def get_competition_by_id(db: AsyncSession, competition_id: uuid.UUID) -> Competition | None:
    return await db.get(Competition, competition_id)


async def get_default_competition(db: AsyncSession) -> Competition | None:
    comp = await get_competition_by_slug(db, DEFAULT_COMPETITION_SLUG)
    if comp:
        return comp
    result = await db.execute(select(Competition).order_by(Competition.created_at.asc()).limit(1))
    return result.scalar_one_or_none()


async def get_group_for_competition(db: AsyncSession, competition_id: uuid.UUID) -> Group | None:
    result = await db.execute(select(Group).where(Group.competition_id == competition_id))
    return result.scalar_one_or_none()


async def get_pool_for_slug(db: AsyncSession, slug: str) -> tuple[Competition, Group] | None:
    comp = await get_competition_by_slug(db, slug)
    if not comp:
        return None
    group = await get_group_for_competition(db, comp.id)
    if not group:
        return None
    return comp, group


async def resolve_competition_for_query(
    db: AsyncSession, slug: str | None = None
) -> Competition | None:
    """Resolve competition from slug query param, else default (mundial-2026)."""
    if slug:
        return await get_competition_by_slug(db, slug.strip().lower())
    return await get_default_competition(db)


async def user_is_competition_admin(
    db: AsyncSession, user: User, competition_id: uuid.UUID
) -> bool:
    if user.is_admin:
        return True
    result = await db.execute(
        select(CompetitionAdmin).where(
            and_(
                CompetitionAdmin.competition_id == competition_id,
                CompetitionAdmin.user_id == user.id,
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def user_is_competition_member(
    db: AsyncSession, user_id: uuid.UUID, competition_id: uuid.UUID
) -> bool:
    group = await get_group_for_competition(db, competition_id)
    if not group:
        return False
    result = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == user_id)
        )
    )
    return result.scalar_one_or_none() is not None


def competition_branding(settings_json: dict[str, Any] | None) -> dict[str, Any]:
    if not settings_json:
        return {"logo_url": None, "primary_color": "#22c55e"}
    branding = settings_json.get("branding") or {}
    return {
        "logo_url": branding.get("logo_url"),
        "primary_color": branding.get("primary_color") or "#22c55e",
    }


def assert_competition_visible(comp: Competition, user: User | None, is_admin: bool) -> None:
    if comp.status not in HIDDEN_STATUSES:
        return
    if is_admin:
        return
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"error": {"code": "COMPETITION_NOT_FOUND", "message": "Competition not found"}},
    )


async def require_competition_access(
    db: AsyncSession,
    comp: Competition,
    user: User,
    *,
    require_member: bool = False,
) -> None:
    is_comp_admin = await user_is_competition_admin(db, user, comp.id)
    assert_competition_visible(comp, user, is_comp_admin)
    if require_member and not is_comp_admin:
        if not await user_is_competition_member(db, user.id, comp.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": {"code": "FORBIDDEN", "message": "Not a member of this competition"}},
            )


async def get_scoring_points(db: AsyncSession, competition_id: uuid.UUID) -> ScoringPoints:
    result = await db.execute(
        select(ScoringRule).where(ScoringRule.competition_id == competition_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        return ScoringPoints()
    return ScoringPoints(exact=rule.exact_score_points, winner=rule.winner_points, wrong=rule.wrong_points)


async def get_prize_distribution(
    db: AsyncSession, competition_id: uuid.UUID
) -> list[tuple[int, float]]:
    result = await db.execute(
        select(PrizeDistribution)
        .where(PrizeDistribution.competition_id == competition_id)
        .order_by(PrizeDistribution.place.asc())
    )
    rows = result.scalars().all()
    if not rows:
        return [(1, 100.0)]
    return [(r.place, float(r.percent)) for r in rows]


async def list_user_competitions(db: AsyncSession, user_id: uuid.UUID) -> list[Competition]:
    result = await db.execute(
        select(Competition)
        .join(Group, Group.competition_id == Competition.id)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(
            and_(
                GroupMember.user_id == user_id,
                Competition.status.notin_(tuple(HIDDEN_STATUSES)),
            )
        )
        .order_by(Competition.name.asc())
    )
    return list(result.scalars().unique().all())


async def list_discoverable_competitions(db: AsyncSession) -> list[Competition]:
    result = await db.execute(
        select(Competition)
        .where(
            and_(
                Competition.visibility == "public",
                Competition.status.in_(tuple(DISCOVER_STATUSES)),
            )
        )
        .order_by(Competition.name.asc())
    )
    return list(result.scalars().all())


async def list_administered_competitions(db: AsyncSession, user_id: uuid.UUID) -> list[Competition]:
    """Competitions where user is competition_admin (not super_admin bypass)."""
    result = await db.execute(
        select(Competition)
        .join(CompetitionAdmin, CompetitionAdmin.competition_id == Competition.id)
        .where(CompetitionAdmin.user_id == user_id)
        .order_by(Competition.name.asc())
    )
    return list(result.scalars().unique().all())
