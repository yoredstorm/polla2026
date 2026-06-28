"""Create and manage competitions (CMS)."""
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_invite_code
from app.models.competition import (
    Competition,
    CompetitionAdmin,
    CompetitionStage,
    ScoringRule,
    PrizeDistribution,
    PaymentSetting,
)
from app.models.group import Group, GroupMember
from app.models.user import User
from app.schemas.competition import CompetitionCreateIn, CompetitionSettings
from app.services.competition_service import competition_branding


async def create_competition(
    db: AsyncSession,
    body: CompetitionCreateIn,
    creator: User,
) -> Competition:
    settings = body.settings or CompetitionSettings()
    settings_dict = settings.model_dump(mode="json")

    comp = Competition(
        slug=body.slug,
        name=body.name,
        sport=body.sport,
        format_type=body.format_type,
        status=body.status,
        visibility=body.visibility,
        invite_code=generate_invite_code() if body.visibility == "invite_only" else None,
        settings_json=settings_dict,
        created_by=creator.id,
    )
    db.add(comp)
    await db.flush()

    db.add(
        ScoringRule(
            competition_id=comp.id,
            exact_score_points=2,
            winner_points=1,
            wrong_points=0,
        )
    )
    for place, pct in ((1, Decimal("60")), (2, Decimal("30")), (3, Decimal("10"))):
        db.add(PrizeDistribution(competition_id=comp.id, place=place, percent=pct))

    db.add(PaymentSetting(competition_id=comp.id))
    db.add(CompetitionAdmin(competition_id=comp.id, user_id=creator.id, role="owner"))

    entry_fee = settings.entry_fee or Decimal("0")
    group = Group(
        name=f"Quiniela {body.name}",
        owner_id=creator.id,
        entry_fee=entry_fee,
        currency=settings.currency,
        bet_amount_mode=settings.bet_amount_mode,
        is_active=True,
        competition_id=comp.id,
    )
    db.add(group)
    await db.flush()
    return comp


async def competition_member_count(db: AsyncSession, competition_id: uuid.UUID) -> int:
    group = (
        await db.execute(select(Group).where(Group.competition_id == competition_id))
    ).scalar_one_or_none()
    if not group:
        return 0
    result = await db.execute(
        select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id)
    )
    return int(result.scalar() or 0)
