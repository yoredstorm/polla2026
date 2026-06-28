"""Competition-scoped routes: /api/v1/c/{competition_slug}/..."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select, and_, func, desc, or_

from app.api.competition_deps import (
    CompetitionAdminContext,
    CompetitionMemberContext,
    VisibleCompetition,
)
from app.api.deps import CurrentUser, DBSession
from app.api.v1.fixtures import _upsert_fixture
from app.api.v1.groups import ActivePollaOut, _active_polla_payment_fields
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.fixture import Fixture
from app.models.group import Group, GroupMember
from app.models.bet import Bet
from app.schemas.fixture import FixtureOut, fixture_to_out
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.schemas.bet import BetOut, BetWithFixtureSummaryOut
from app.services.competition_service import (
    get_group_for_competition,
    user_is_competition_admin,
    user_is_competition_member,
)
from app.services.fixture_import_service import parse_csv_fixtures, parse_json_fixtures, parse_xlsx_fixtures
from app.services.competition_admin_service import competition_member_count

router = APIRouter(prefix="/c/{competition_slug}", tags=["Competition Scoped"])


@router.get("/context")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_competition_context(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    from app.services.competition_service import competition_branding

    is_member = await user_is_competition_member(db, current_user.id, comp.id)
    is_admin = await user_is_competition_admin(db, current_user, comp.id)
    count = await competition_member_count(db, comp.id)
    branding = competition_branding(comp.settings_json)
    return {
        "id": str(comp.id),
        "slug": comp.slug,
        "name": comp.name,
        "status": comp.status,
        "logo_url": branding["logo_url"],
        "primary_color": branding["primary_color"],
        "is_member": is_member,
        "is_admin": is_admin,
        "member_count": count,
    }


async def _user_is_competition_admin(db, user, competition_id):
    from app.services.competition_service import user_is_competition_admin
    return await user_is_competition_admin(db, user, competition_id)


@router.get("/pool", response_model=Optional[ActivePollaOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_competition_pool(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    from decimal import Decimal
    from sqlalchemy import func
    from app.api.v1.groups import EnrollmentChoiceOut
    from app.services.phase_enrollment_service import (
        ensure_phase_fees_for_group,
        resolve_payment_target_phase,
        get_phase_fee,
        get_new_user_enrollment_choices,
    )
    from app.services.prize_structure_service import get_effective_phases, phase_label
    from app.services.competition_service import get_group_for_competition

    group = await get_group_for_competition(db, comp.id)
    if not group:
        return None

    await ensure_phase_fees_for_group(db, group)
    member_res = await db.execute(
        select(GroupMember).where(
            and_(GroupMember.group_id == group.id, GroupMember.user_id == current_user.id)
        )
    )
    is_member = member_res.scalar_one_or_none() is not None
    phase_key = group.current_phase_key or get_effective_phases(group)[0]
    from app.services.group_service import count_phase_enrolled_members

    member_count = await count_phase_enrolled_members(db, group.id, phase_key)
    per_match = group.fixed_bet_amount if group.fixed_bet_amount and group.fixed_bet_amount > 0 else None
    contact_name, phone, qr_url = _active_polla_payment_fields(group)
    phase_fee = await get_phase_fee(db, group.id, phase_key)
    phase_entry = phase_fee.entry_fee if phase_fee else group.entry_fee
    phase_extra = phase_fee.extra_per_match if phase_fee else group.fixed_bet_amount
    await resolve_payment_target_phase(db, group, current_user.id, is_member=is_member)
    choices = await get_new_user_enrollment_choices(db, group, current_user.id)

    return ActivePollaOut(
        id=group.id,
        name=group.name,
        entry_fee=group.entry_fee,
        prize_pool=group.prize_pool,
        currency=group.currency,
        per_match_amount=per_match,
        is_member=is_member,
        member_count=member_count,
        payment_contact_name=contact_name,
        payment_phone=phone,
        payment_qr_url=qr_url,
        challenges_enabled=group.challenges_enabled,
        current_phase_key=phase_key,
        current_phase_label=phase_label(phase_key),
        current_phase_entry_fee=str(phase_entry),
        current_phase_extra_per_match=str(phase_extra) if phase_extra else None,
        phase_enrollment_status="none",
        prize_structure_mode=group.prize_structure_mode,
        enrollment_choices=[EnrollmentChoiceOut(**c) for c in choices],
    )


@router.get("/fixtures", response_model=PaginatedResponse[FixtureOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_fixtures(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
    group_label: Optional[str] = Query(None, alias="group_name"),
    round_name: Optional[str] = Query(None, alias="round"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    fixture_status: Optional[str] = Query(None, alias="status"),
    exclude_finished: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    filters = [Fixture.competition_id == comp.id]
    if group_label:
        filters.append(
            or_(Fixture.group_label == group_label, Fixture.group_name == group_label)
        )
    if round_name:
        filters.append(Fixture.round == round_name)
    if date_from:
        filters.append(Fixture.match_date >= date_from)
    if date_to:
        filters.append(Fixture.match_date <= date_to)
    if fixture_status:
        filters.append(Fixture.status == fixture_status)
    if exclude_finished:
        filters.append(Fixture.status != "finished")

    count_q = await db.execute(select(func.count()).select_from(Fixture).where(and_(*filters)))
    total = int(count_q.scalar() or 0)
    offset = (page - 1) * limit
    order = desc(Fixture.match_date) if fixture_status == "finished" else Fixture.match_date.asc()
    result = await db.execute(
        select(Fixture)
        .where(and_(*filters))
        .order_by(order)
        .offset(offset)
        .limit(limit)
    )
    items = [fixture_to_out(f) for f in result.scalars().all()]
    return PaginatedResponse(
        data=items,
        pagination=PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            total_pages=max(1, (total + limit - 1) // limit),
        ),
    )


@router.get("/fixtures/groups", response_model=list[str])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_fixture_groups(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    result = await db.execute(
        select(Fixture.group_label)
        .where(and_(Fixture.competition_id == comp.id, Fixture.group_label.isnot(None)))
        .distinct()
        .order_by(Fixture.group_label)
    )
    labels = [row[0] for row in result.all() if row[0]]
    if labels:
        return labels
    result = await db.execute(
        select(Fixture.group_name)
        .where(and_(Fixture.competition_id == comp.id, Fixture.group_name.isnot(None)))
        .distinct()
        .order_by(Fixture.group_name)
    )
    return [row[0] for row in result.all()]


@router.get("/fixtures/live", response_model=list[FixtureOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_live_fixtures(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    result = await db.execute(
        select(Fixture).where(
            and_(Fixture.competition_id == comp.id, Fixture.status == "live")
        )
    )
    return [fixture_to_out(f) for f in result.scalars().all()]


@router.get("/fixtures/{fixture_id}", response_model=FixtureOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_competition_fixture(
    request: Request,
    fixture_id: uuid.UUID,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    result = await db.execute(
        select(Fixture).where(
            and_(Fixture.id == fixture_id, Fixture.competition_id == comp.id)
        )
    )
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    return fixture_to_out(fixture)


@router.get("/tournament-phases")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_tournament_phases(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    from app.services.prize_structure_service import list_tournament_phases_for_group

    group = await get_group_for_competition(db, comp.id)
    if not group:
        return []
    return list_tournament_phases_for_group(group)


@router.get("/tournament-progress")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_competition_tournament_progress(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
):
    from app.api.v1.groups import TournamentProgressOut
    from app.services.tournament_phase_service import build_tournament_progress

    group = await get_group_for_competition(db, comp.id)
    if not group:
        return None
    progress = await build_tournament_progress(db, group.id)
    return TournamentProgressOut(group_id=str(group.id), **progress)


@router.get("/my-bets", response_model=PaginatedResponse[BetWithFixtureSummaryOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_competition_my_bets(
    request: Request,
    comp: VisibleCompetition,
    current_user: CurrentUser,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    count_base = (
        select(Bet.id)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(
            and_(Bet.user_id == current_user.id, Fixture.competition_id == comp.id)
        )
    )
    count_result = await db.execute(select(func.count()).select_from(count_base.subquery()))
    total = int(count_result.scalar() or 0)

    base = (
        select(Bet, Fixture)
        .join(Fixture, Bet.fixture_id == Fixture.id)
        .where(
            and_(Bet.user_id == current_user.id, Fixture.competition_id == comp.id)
        )
    )
    result = await db.execute(
        base.order_by(Bet.created_at.desc()).offset((page - 1) * limit).limit(limit)
    )
    rows = result.all()
    out: list[BetWithFixtureSummaryOut] = []
    for bet, fx in rows:
        d = BetOut.model_validate(bet).model_dump()
        d["fixture_match_date"] = fx.match_date
        d["fixture_home_team"] = fx.home_team
        d["fixture_away_team"] = fx.away_team
        d["fixture_status"] = fx.status
        out.append(BetWithFixtureSummaryOut(**d))

    return PaginatedResponse(
        data=out,
        pagination=PaginationMeta(
            total=total,
            page=page,
            limit=limit,
            total_pages=max(1, (total + limit - 1) // limit),
        ),
    )


@router.post("/admin/fixtures/import")
@limiter.limit("10/minute")
async def import_competition_fixtures(
    request: Request,
    comp: CompetitionAdminContext,
    db: DBSession,
    file: UploadFile = File(...),
    dry_run: bool = Query(False),
):
    raw = await file.read()
    name = (file.filename or "").lower()
    if name.endswith(".csv"):
        preview = parse_csv_fixtures(raw.decode("utf-8-sig"), comp.id)
    elif name.endswith(".json"):
        preview = parse_json_fixtures(raw, comp.id)
    elif name.endswith(".xlsx"):
        preview = parse_xlsx_fixtures(raw, comp.id)
    else:
        raise HTTPException(status_code=400, detail="Supported formats: .json, .csv, .xlsx")
    if not preview.ok:
        return {
            "ok": False,
            "dry_run": dry_run,
            "errors": [{"row": e.row, "message": e.message} for e in preview.errors],
            "count": 0,
        }
    if dry_run:
        return {"ok": True, "dry_run": True, "count": len(preview.records), "errors": []}
    for data in preview.records:
        await _upsert_fixture(db, data)
    await db.commit()
    return {"ok": True, "dry_run": False, "count": len(preview.records), "errors": []}


@router.get("/admin/fixtures/import-template.csv")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def download_csv_template(request: Request, comp: CompetitionAdminContext):
    from fastapi.responses import PlainTextResponse

    template = (
        "external_id,date,time,team1,team2,round,ground,group\n"
        "1,2026-06-11,13:00 UTC-6,Argentina,Portugal,Matchday 1,MetLife Stadium,Group A\n"
    )
    return PlainTextResponse(template, media_type="text/csv")
