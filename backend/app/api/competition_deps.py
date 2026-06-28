"""Competition-scoped FastAPI dependencies."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_user, get_db
from app.models.competition import Competition
from app.models.user import User
from app.services.competition_service import (
    get_competition_by_slug,
    require_competition_access,
    user_is_competition_admin,
)


async def get_current_super_admin(
    current_user: User = Depends(get_current_admin),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Super admin access required"}},
        )
    return current_user


async def resolve_competition(
    competition_slug: str = Path(..., min_length=2, max_length=80),
    db: AsyncSession = Depends(get_db),
) -> Competition:
    comp = await get_competition_by_slug(db, competition_slug.strip().lower())
    if not comp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "COMPETITION_NOT_FOUND", "message": "Competition not found"}},
        )
    return comp


async def get_visible_competition(
    comp: Competition = Depends(resolve_competition),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Competition:
    is_admin = await user_is_competition_admin(db, current_user, comp.id)
    from app.services.competition_service import assert_competition_visible

    assert_competition_visible(comp, current_user, is_admin)
    return comp


async def get_competition_member_context(
    comp: Competition = Depends(get_visible_competition),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Competition:
    await require_competition_access(db, comp, current_user, require_member=False)
    return comp


async def get_competition_admin_context(
    comp: Competition = Depends(resolve_competition),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Competition:
    if not await user_is_competition_admin(db, current_user, comp.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Competition admin access required"}},
        )
    return comp


CurrentSuperAdmin = Annotated[User, Depends(get_current_super_admin)]
ResolvedCompetition = Annotated[Competition, Depends(resolve_competition)]
VisibleCompetition = Annotated[Competition, Depends(get_visible_competition)]
CompetitionMemberContext = Annotated[Competition, Depends(get_competition_member_context)]
CompetitionAdminContext = Annotated[Competition, Depends(get_competition_admin_context)]
