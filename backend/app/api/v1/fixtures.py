"""
Fixtures router — list, detail, live, seed from JSON.
"""
from typing import Optional
from datetime import datetime
import uuid

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, CurrentAdmin, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.models.fixture import Fixture
from app.schemas.fixture import FixtureOut
from app.schemas.common import PaginatedResponse, PaginationMeta
from app.services.bet_service import should_lock_fixture

router = APIRouter(prefix="/fixtures", tags=["Fixtures"])


async def _upsert_fixture(db: AsyncSession, data: dict) -> Fixture:
    """Insert or update a fixture row from a parsed dict."""
    result = await db.execute(
        select(Fixture).where(Fixture.external_id == data["external_id"])
    )
    fixture = result.scalar_one_or_none()

    if not fixture:
        fixture = Fixture(**data)
        db.add(fixture)
    else:
        for key, val in data.items():
            setattr(fixture, key, val)

    if should_lock_fixture(fixture):
        fixture.is_locked = True

    await db.flush()
    return fixture


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
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=200),
):
    query = select(Fixture)
    filters = []
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
    if filters:
        query = query.where(and_(*filters))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(Fixture.match_date).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    fixtures = result.scalars().all()

    return PaginatedResponse(
        data=[FixtureOut.model_validate(f) for f in fixtures],
        pagination=PaginationMeta(total=total, page=page, limit=limit, total_pages=-(-total // limit)),
    )


@router.get("/live", response_model=list[FixtureOut])
@limiter.limit(GLOBAL_RATE_LIMIT)
async def live_fixtures(request: Request, current_user: CurrentUser, db: DBSession):
    result = await db.execute(select(Fixture).where(Fixture.status == "live"))
    return [FixtureOut.model_validate(f) for f in result.scalars().all()]


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
    return FixtureOut.model_validate(fixture)


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
