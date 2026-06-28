"""Public site configuration endpoints (no auth)."""
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.core.rate_limiter import GLOBAL_RATE_LIMIT, limiter

router = APIRouter(prefix="/site", tags=["Site"])


@router.get("/marquee")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_public_marquee_deprecated(request: Request):
    """Deprecated global marquee — use GET /c/{slug}/marquee per competition."""
    return JSONResponse(
        content={"enabled": False, "message": ""},
        headers={"Cache-Control": "no-store, must-revalidate"},
    )
