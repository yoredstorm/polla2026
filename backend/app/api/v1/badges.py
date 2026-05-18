"""Public badge catalog for gamification UI."""
from fastapi import APIRouter, Request

from app.api.deps import CurrentUser, DBSession
from app.core.rate_limiter import limiter, GLOBAL_RATE_LIMIT
from app.services.gamification_service import compute_badges, get_badge_catalog

router = APIRouter(prefix="/badges", tags=["Badges"])


@router.get("/catalog")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_catalog(request: Request):
    """All medals in the system (criteria for collection)."""
    return {"badges": get_badge_catalog()}


@router.get("/catalog/me")
@limiter.limit(GLOBAL_RATE_LIMIT)
async def get_catalog_with_progress(
    request: Request,
    current_user: CurrentUser,
    db: DBSession,
):
    """Catalog plus which medals the current user has earned."""
    from app.models.group import Group
    from sqlalchemy import select

    catalog = get_badge_catalog()
    group_id = None
    result = await db.execute(
        select(Group.id).where(Group.is_active == True).order_by(Group.created_at.asc()).limit(1)  # noqa: E712
    )
    group_id = result.scalar_one_or_none()
    from app.services.gamification_service import ranking_position_for_user

    position = await ranking_position_for_user(db, current_user.id, group_id)
    earned = await compute_badges(db, current_user.id, group_id=group_id, position=position)
    earned_ids = {b["id"] for b in earned}
    return {
        "badges": catalog,
        "earned_ids": list(earned_ids),
        "earned_count": len(earned_ids),
        "total_count": len(catalog),
    }
