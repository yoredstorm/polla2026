"""Admin endpoints for Google live sync visibility and configuration."""
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.api.deps import CurrentAdmin, DBSession, RedisClient
from app.core.rate_limiter import limiter
from app.models.fixture import Fixture
from app.services.fixture_live_sync_service import (
    get_fixture_sync_logs,
    get_live_sync_status_summary,
    list_sync_fixtures,
    retry_fixture_sync,
)
from app.services.live_sync_settings_service import (
    settings_to_dict,
    update_live_sync_settings,
    get_live_sync_settings,
)
from sqlalchemy import select

router = APIRouter(prefix="/admin/live-sync", tags=["admin-live-sync"])

ADMIN_RATE = "60/minute"


class LiveSyncSettingsPatch(BaseModel):
    poll_interval_seconds: Optional[int] = Field(None, ge=5, le=120)
    pre_kickoff_minutes: Optional[int] = Field(None, ge=5, le=60)
    max_concurrent_polls: Optional[int] = Field(None, ge=1, le=10)
    failure_threshold: Optional[int] = Field(None, ge=3, le=20)
    confirm_reads_required: Optional[int] = Field(None, ge=1, le=5)
    sync_enabled_globally: Optional[bool] = None


class FixtureSyncModePatch(BaseModel):
    sync_mode: Literal["auto", "manual", "failed"]


@router.get("/settings")
@limiter.limit(ADMIN_RATE)
async def get_settings(request: Request, admin: CurrentAdmin, db: DBSession, redis: RedisClient):
    row = await get_live_sync_settings(db, redis)
    return settings_to_dict(row)


@router.patch("/settings")
@limiter.limit(ADMIN_RATE)
async def patch_settings(
    request: Request,
    body: LiveSyncSettingsPatch,
    admin: CurrentAdmin,
    db: DBSession,
    redis: RedisClient,
):
    row = await update_live_sync_settings(
        db,
        redis,
        poll_interval_seconds=body.poll_interval_seconds,
        pre_kickoff_minutes=body.pre_kickoff_minutes,
        max_concurrent_polls=body.max_concurrent_polls,
        failure_threshold=body.failure_threshold,
        confirm_reads_required=body.confirm_reads_required,
        sync_enabled_globally=body.sync_enabled_globally,
    )
    await db.commit()
    return settings_to_dict(row)


@router.get("/status")
@limiter.limit(ADMIN_RATE)
async def get_status(request: Request, admin: CurrentAdmin, db: DBSession):
    return await get_live_sync_status_summary(db)


@router.get("/fixtures")
@limiter.limit(ADMIN_RATE)
async def get_sync_fixtures(
    request: Request,
    admin: CurrentAdmin,
    db: DBSession,
    limit: int = Query(50, ge=1, le=100),
):
    return {"data": await list_sync_fixtures(db, limit=limit)}


@router.get("/fixtures/{fixture_id}/logs")
@limiter.limit(ADMIN_RATE)
async def get_sync_fixture_logs(
    request: Request,
    fixture_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Fixture not found")
    return await get_fixture_sync_logs(db, fixture_id, page=page, limit=limit)


@router.post("/fixtures/{fixture_id}/retry")
@limiter.limit(ADMIN_RATE)
async def retry_sync_fixture(
    request: Request,
    fixture_id: uuid.UUID,
    admin: CurrentAdmin,
    db: DBSession,
):
    res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    await retry_fixture_sync(db, fixture)
    await db.commit()
    return {"ok": True, "sync_mode": fixture.sync_mode}


@router.patch("/fixtures/{fixture_id}/sync-mode")
@limiter.limit(ADMIN_RATE)
async def patch_fixture_sync_mode(
    request: Request,
    fixture_id: uuid.UUID,
    body: FixtureSyncModePatch,
    admin: CurrentAdmin,
    db: DBSession,
):
    res = await db.execute(select(Fixture).where(Fixture.id == fixture_id))
    fixture = res.scalar_one_or_none()
    if not fixture:
        raise HTTPException(status_code=404, detail="Fixture not found")
    fixture.sync_mode = body.sync_mode
    if body.sync_mode == "auto":
        fixture.consecutive_sync_failures = 0
    await db.commit()
    return {"ok": True, "sync_mode": fixture.sync_mode}
