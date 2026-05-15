"""Rules for public / invite-only bet profile visibility."""
import secrets
import uuid

from app.core.security import hash_token
from app.models.user import User


def can_view_user_bets_list(viewer_id: uuid.UUID, target: User, invite_code: str | None) -> bool:
    if target.bets_profile_visibility == "public":
        return True
    if viewer_id == target.id:
        return True
    if not invite_code or not target.bets_profile_invite_hash:
        return False
    return secrets.compare_digest(hash_token(invite_code), target.bets_profile_invite_hash)


def can_show_bet_count(viewer_id: uuid.UUID, target: User, invite_code: str | None) -> bool:
    """Summary may hide total_bets when profile is invite-only and viewer has no access."""
    return can_view_user_bets_list(viewer_id, target, invite_code)
