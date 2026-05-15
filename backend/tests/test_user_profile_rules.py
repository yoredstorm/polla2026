"""Unit tests for bet-profile visibility rules (no FastAPI app import)."""
import uuid

from app.core.security import generate_profile_bets_invite_code, hash_token
from app.services.user_profile_service import can_view_user_bets_list, can_show_bet_count


def _user(visibility: str, invite_hash: str | None, uid: uuid.UUID | None = None):
    """Minimal stand-in for User ORM."""
    uid = uid or uuid.uuid4()

    class U:
        pass

    o = U()
    o.id = uid
    o.bets_profile_visibility = visibility
    o.bets_profile_invite_hash = invite_hash
    return o


def test_public_any_viewer():
    target = _user("public", None)
    v = uuid.uuid4()
    assert can_view_user_bets_list(v, target, None) is True
    assert can_show_bet_count(v, target, None) is True


def test_invite_only_owner_without_code():
    uid = uuid.uuid4()
    target = _user("invite_only", hash_token("secret"), uid)
    assert can_view_user_bets_list(uid, target, None) is True


def test_invite_only_other_needs_code():
    owner = uuid.uuid4()
    other = uuid.uuid4()
    code = generate_profile_bets_invite_code()
    target = _user("invite_only", hash_token(code), owner)
    assert can_view_user_bets_list(other, target, None) is False
    assert can_view_user_bets_list(other, target, "wrong") is False
    assert can_view_user_bets_list(other, target, code) is True

