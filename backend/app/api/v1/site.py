"""Public site configuration endpoints (no auth)."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.deps import DBSession
from app.core.rate_limiter import GLOBAL_RATE_LIMIT, limiter
from app.services.marquee_service import get_marquee, public_marquee_payload

router = APIRouter(prefix="/site", tags=["Site"])


@router.get("/marquee")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_public_marquee(request: Request, db: DBSession):
    marquee = await get_marquee(db)
    payload = public_marquee_payload(marquee)
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=30"},
    )
