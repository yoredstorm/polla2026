"""
Fixtures router — list, detail, live, seed from JSON.
"""
from typing import Optional
from datetime import datetime
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select, and_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, CurrentAdmin, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.fixture import Fixture
from app.core.match_timing import should_lock_fixture
from app.schemas.fixture import FixtureOut, fixture_to_out
from app.schemas.common import PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/fixtures", tags=["Fixtures"])


async def _upsert_fixture(db: AsyncSession, data: dict) -> Fixture:
    """Insert or update a fixture row from a parsed dict."""
    competition_id = data.get("competition_id")
    external_id = data["external_id"]
    query = select(Fixture).where(Fixture.external_id == external_id)
    if competition_id is not None:
        query = query.where(Fixture.competition_id == competition_id)
    result = await db.execute(query)
    fixture = result.scalar_one_or_none()

    if not fixture:
        fixture = Fixture(**data)
        db.add(fixture)
    else:
        for key, val in data.items():
            setattr(fixture, key, val)

    if should_lock_fixture(fixture):
        from app.services.betting_close_service import close_fixture_betting_if_due

        await close_fixture_betting_if_due(db, fixture)

    await db.flush()
    return fixture


@router.get("/tournament-phases")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_tournament_phases(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    competition_slug: str | None = Query(None, alias="slug"),
):
    from app.services.tournament_phase_service import get_active_polla
    from app.services.prize_structure_service import list_tournament_phases_for_group
    from app.services.competition_service import resolve_competition_for_query

    comp = await resolve_competition_for_query(db, competition_slug)
    polla = await get_active_polla(db, competition_id=comp.id if comp else None)
    if not polla:
        return []
    return list_tournament_phases_for_group(polla)


@router.get("/groups", response_model=list[str])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_groups(request: Request, current_user: CurrentUser, db: DBSession):
    """Return distinct group names that have fixtures, sorted alphabetically."""
    result = await db.execute(
        select(Fixture.group_name)
        .where(Fixture.group_name.isnot(None))
        .distinct()
        .order_by(Fixture.group_name)
    )
    return [row[0] for row in result.all()]


@router.get("", response_model=PaginatedResponse[FixtureOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def list_fixtures(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    group_name: Optional[str] = Query(None, description="Filter by group, e.g. 'Group A'"),
    round_name: Optional[str] = Query(None, alias="round", description="Filter by round name"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    fixture_status: Optional[str] = Query(None, alias="status"),
    exclude_finished: Optional[bool] = Query(None, description="If true, omit fixtures with status finished"),
    tournament_phase: Optional[str] = Query(
        None, description="Canonical phase: groups, round_of_32, round_of_16, quarterfinal, semifinal, third_place, final"
    ),
    competition_slug: Optional[str] = Query(None, alias="slug"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    from app.services.competition_service import resolve_competition_for_query

    query = select(Fixture)
    filters = []
    comp = await resolve_competition_for_query(db, competition_slug)
    if comp:
        filters.append(Fixture.competition_id == comp.id)
    if tournament_phase:
        from app.services.tournament_phase_service import get_active_polla
        from app.services.prize_structure_service import (
            effective_phase_fixture_filter,
            is_effective_phase,
        )

        polla = await get_active_polla(db, competition_id=comp.id if comp else None)
        if not polla or not is_effective_phase(tournament_phase, polla):
            raise HTTPException(status_code=400, detail="Invalid tournament_phase")
        filters.append(effective_phase_fixture_filter(tournament_phase, polla))
    if group_name:
        filters.append(Fixture.group_name == group_name)
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
    if filters:
        query = query.where(and_(*filters))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    if fixture_status == "finished":
        query = query.order_by(desc(Fixture.match_date))
    else:
        query = query.order_by(Fixture.match_date)
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    fixtures = result.scalars().all()

    return PaginatedResponse(
        data=[fixture_to_out(f) for f in fixtures],
        pagination=PaginationMeta(total=total, page=page, limit=limit, total_pages=-(-total // limit)),
    )


@router.get("/live", response_model=list[FixtureOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def live_fixtures(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
    competition_slug: Optional[str] = Query(None, alias="slug"),
):
    from app.services.competition_service import resolve_competition_for_query

    filters = [Fixture.status == "live"]
    comp = await resolve_competition_for_query(db, competition_slug)
    if comp:
        filters.append(Fixture.competition_id == comp.id)
    result = await db.execute(select(Fixture).where(and_(*filters)))
    return [fixture_to_out(f) for f in result.scalars().all()]


@router.get("/{fixture_id}/betting-trends")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def fixture_betting_trends(
    request: Request,
    fixture_id: uuid.UUID,
    current_user: CurrentUser,
    db: DBSession,
):
    from app.services.betting_trends_service import get_fixture_betting_trends

    data = await get_fixture_betting_trends(db, fixture_id)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FIXTURE_NOT_FOUND", "message": "Fixture not found"}},
        )
    return data


@router.get("/{fixture_id}", response_model=FixtureOut)
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_fixture(request: Request, fixture_id: uuid.UUID, current_user: CurrentUser, db: DBSession):
    result = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = result.scalar_one_or_none()
    if not fixture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FIXTURE_NOT_FOUND", "message": "Fixture not found"}},
        )
    return fixture_to_out(fixture)


@router.post("/seed", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def seed_fixtures(request: Request, current_admin: CurrentAdmin, db: DBSession):
    """
    Admin-only: (Re)seed the fixtures table from the bundled World Cup 2026 JSON.
    Safe to call multiple times — uses upsert logic.
    """
    from app.services.worldcup_loader import load_fixtures
    records = load_fixtures()
    count = 0
    for data in records:
        await _upsert_fixture(db, data)
        count += 1
    await db.commit()
    return {"message": f"Seeded {count} fixtures from World Cup 2026 JSON"}
