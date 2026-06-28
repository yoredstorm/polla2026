"""Competition listing and super-admin CMS API."""

import uuid
from typing import List

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.api.competition_deps import CurrentSuperAdmin, CompetitionAdminContext, VisibleCompetition
from app.api.deps import CurrentUser, DBSession, RedisClient
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.competition import (
    Competition,
    CompetitionAdmin,
    CompetitionStage,
    ScoringRule,
    PrizeDistribution,
    PaymentSetting,
)
from app.models.user import User
from app.schemas.competition import (
    CompetitionCardOut,
    CompetitionCreateIn,
    CompetitionDetailOut,
    CompetitionUpdateIn,
    CompetitionAdminIn,
    CompetitionAdminOut,
    CompetitionStageIn,
    CompetitionStageOut,
    ScoringRuleIn,
    ScoringRuleOut,
    PrizePlaceIn,
    PaymentSettingIn,
    PaymentSettingOut,
)
from pydantic import BaseModel

from app.services.competition_admin_service import create_competition, competition_member_count
from app.services.competition_service import (
    competition_branding,
    list_administered_competitions,
    list_discoverable_competitions,
    list_user_competitions,
    user_is_competition_admin,
    user_is_competition_member,
)
from app.services.audit import log_action


class PrizeDistributionUpdate(BaseModel):
    places: List[PrizePlaceIn]


router = APIRouter(prefix="/competitions", tags=["Competitions"])


def _card(comp: Competition, *, is_member: bool = False, member_count: int = 0) -> CompetitionCardOut:
    branding = competition_branding(comp.settings_json)
    return CompetitionCardOut(
        id=comp.id,
        slug=comp.slug,
        name=comp.name,
        sport=comp.sport,
        format_type=comp.format_type,
        status=comp.status,
        visibility=comp.visibility,
        logo_url=branding["logo_url"],
        primary_color=branding["primary_color"],
        is_member=is_member,
        member_count=member_count,
    )


@router.get("/mine", response_model=List[CompetitionCardOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_my_competitions(request: Request, current_user: CurrentUser, db: DBSession):
    comps = await list_user_competitions(db, current_user.id)
    out: List[CompetitionCardOut] = []
    for comp in comps:
        count = await competition_member_count(db, comp.id)
        out.append(_card(comp, is_member=True, member_count=count))
    return out


@router.get("/administered", response_model=List[CompetitionCardOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_administered_competition_cards(
    request: Request, current_user: CurrentUser, db: DBSession
):
    """Competitions the user administers (competition_admins table)."""
    comps = await list_administered_competitions(db, current_user.id)
    out: List[CompetitionCardOut] = []
    for comp in comps:
        is_member = await user_is_competition_member(db, current_user.id, comp.id)
        count = await competition_member_count(db, comp.id)
        out.append(_card(comp, is_member=is_member, member_count=count))
    return out


@router.get("/discover", response_model=List[CompetitionCardOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def discover_competitions(request: Request, current_user: CurrentUser, db: DBSession):
    comps = await list_discoverable_competitions(db)
    out: List[CompetitionCardOut] = []
    for comp in comps:
        is_member = await user_is_competition_member(db, current_user.id, comp.id)
        count = await competition_member_count(db, comp.id)
        out.append(_card(comp, is_member=is_member, member_count=count))
    return out


@router.get("", response_model=List[CompetitionDetailOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_all_competitions(request: Request, admin: CurrentSuperAdmin, db: DBSession):
    result = await db.execute(select(Competition).order_by(Competition.created_at.desc()))
    comps = result.scalars().all()
    return [
        CompetitionDetailOut(
            **_card(c).model_dump(),
            settings_json=c.settings_json,
            created_at=c.created_at,
        )
        for c in comps
    ]


@router.post("", status_code=201, response_model=CompetitionDetailOut)
@limiter.limit("20/minute")
async def create_competition_endpoint(
    request: Request,
    body: CompetitionCreateIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    existing = await db.execute(select(Competition).where(Competition.slug == body.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug already exists")
    comp = await create_competition(db, body, admin)
    await log_action(db, user_id=admin.id, action="competition_created", detail={"slug": comp.slug})
    await db.commit()
    await db.refresh(comp)
    return CompetitionDetailOut(
        **_card(comp).model_dump(),
        settings_json=comp.settings_json,
        created_at=comp.created_at,
    )


@router.get("/{competition_id}", response_model=CompetitionDetailOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_competition_by_id(
    request: Request,
    competition_id: uuid.UUID,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    comp = await db.get(Competition, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    count = await competition_member_count(db, comp.id)
    return CompetitionDetailOut(
        **_card(comp, member_count=count).model_dump(),
        settings_json=comp.settings_json,
        created_at=comp.created_at,
    )


@router.patch("/{competition_id}", response_model=CompetitionDetailOut)
@limiter.limit("30/minute")
async def update_competition(
    request: Request,
    competition_id: uuid.UUID,
    body: CompetitionUpdateIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    comp = await db.get(Competition, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    if body.name is not None:
        comp.name = body.name
    if body.sport is not None:
        comp.sport = body.sport
    if body.format_type is not None:
        comp.format_type = body.format_type
    if body.status is not None:
        comp.status = body.status
    if body.visibility is not None:
        comp.visibility = body.visibility
    if body.settings is not None:
        incoming = body.settings.model_dump(mode="json")
        existing = dict(comp.settings_json or {})
        branding = {**(existing.get("branding") or {}), **(incoming.get("branding") or {})}
        merged = {**existing, **incoming, "branding": branding}
        comp.settings_json = merged
    await db.commit()
    await db.refresh(comp)
    return CompetitionDetailOut(
        **_card(comp).model_dump(),
        settings_json=comp.settings_json,
        created_at=comp.created_at,
    )


@router.post("/{competition_id}/admins", status_code=201)
@limiter.limit("20/minute")
async def assign_competition_admin(
    request: Request,
    competition_id: uuid.UUID,
    body: CompetitionAdminIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    comp = await db.get(Competition, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Not found")
    target = await db.get(User, body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing = await db.execute(
        select(CompetitionAdmin).where(
            and_(
                CompetitionAdmin.competition_id == competition_id,
                CompetitionAdmin.user_id == body.user_id,
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already an admin")
    db.add(
        CompetitionAdmin(
            competition_id=competition_id,
            user_id=body.user_id,
            role=body.role,
        )
    )
    await db.commit()
    return {"ok": True}


@router.get("/{competition_id}/admins", response_model=List[CompetitionAdminOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_admins(
    request: Request,
    competition_id: uuid.UUID,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    result = await db.execute(
        select(CompetitionAdmin, User)
        .join(User, User.id == CompetitionAdmin.user_id)
        .where(CompetitionAdmin.competition_id == competition_id)
    )
    return [
        CompetitionAdminOut(user_id=ca.user_id, username=user.username, role=ca.role)
        for ca, user in result.all()
    ]


@router.put("/{competition_id}/scoring", response_model=ScoringRuleOut)
@limiter.limit("20/minute")
async def upsert_scoring_rules(
    request: Request,
    competition_id: uuid.UUID,
    body: ScoringRuleIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    result = await db.execute(select(ScoringRule).where(ScoringRule.competition_id == competition_id))
    rule = result.scalar_one_or_none()
    if not rule:
        rule = ScoringRule(competition_id=competition_id)
        db.add(rule)
    rule.exact_score_points = body.exact_score_points
    rule.winner_points = body.winner_points
    rule.wrong_points = body.wrong_points
    await db.commit()
    await db.refresh(rule)
    return ScoringRuleOut(
        competition_id=competition_id,
        exact_score_points=rule.exact_score_points,
        winner_points=rule.winner_points,
        wrong_points=rule.wrong_points,
    )


@router.put("/{competition_id}/prizes")
@limiter.limit("20/minute")
async def upsert_prize_distribution(
    request: Request,
    competition_id: uuid.UUID,
    body: PrizeDistributionUpdate,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    places = body.places
    total = sum(float(p.percent) for p in places)
    if abs(total - 100.0) > 0.01:
        raise HTTPException(status_code=400, detail="Percentages must sum to 100")
    await db.execute(
        PrizeDistribution.__table__.delete().where(PrizeDistribution.competition_id == competition_id)
    )
    for p in places:
        db.add(PrizeDistribution(competition_id=competition_id, place=p.place, percent=p.percent))
    await db.commit()
    return {"ok": True}


@router.put("/{competition_id}/payment", response_model=PaymentSettingOut)
@limiter.limit("20/minute")
async def upsert_payment_settings(
    request: Request,
    competition_id: uuid.UUID,
    body: PaymentSettingIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    result = await db.execute(
        select(PaymentSetting).where(PaymentSetting.competition_id == competition_id)
    )
    ps = result.scalar_one_or_none()
    if not ps:
        ps = PaymentSetting(competition_id=competition_id)
        db.add(ps)
    ps.contact_name = body.contact_name
    ps.phone = body.phone
    ps.instructions_text = body.instructions_text
    await db.commit()
    await db.refresh(ps)
    return PaymentSettingOut(
        competition_id=competition_id,
        contact_name=ps.contact_name,
        phone=ps.phone,
        instructions_text=ps.instructions_text,
        qr_path=ps.qr_path,
    )


@router.post("/{competition_id}/stages", status_code=201, response_model=CompetitionStageOut)
@limiter.limit("20/minute")
async def add_competition_stage(
    request: Request,
    competition_id: uuid.UUID,
    body: CompetitionStageIn,
    admin: CurrentSuperAdmin,
    db: DBSession,
):
    stage = CompetitionStage(
        competition_id=competition_id,
        name=body.name,
        stage_type=body.stage_type,
        order=body.order,
    )
    db.add(stage)
    await db.commit()
    await db.refresh(stage)
    return CompetitionStageOut(
        id=stage.id,
        competition_id=stage.competition_id,
        name=stage.name,
        stage_type=stage.stage_type,
        order=stage.order,
    )
