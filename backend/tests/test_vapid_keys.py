"""VAPID key validation for Web Push."""
from app.services.vapid_keys import (
    derive_public_key_from_private,
    env_public_matches_derived,
    public_key_for_browser,
    validate_vapid_private_key,
    validate_vapid_public_key,
    vapid_env_configured,
)

# Legacy web-push README example (64-byte point — rejected by strict browsers)
LEGACY_PUBLIC = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQaIQhFf6v9N8"
VALID_PUBLIC = "BIqzYsOiaU0RBVVaN4RhsJCnGp02QO9T8PywY08zvg9js83aK7J3Pd4_YkW66BO1CGYAYFiTzDIrSdPYeBXh5Ow"
VALID_PRIVATE = "g5iyoLfzVn2oydLYnvIP8sKi5IaYTOVkhIkTxBjunGk"


def test_legacy_example_public_key_is_invalid():
    assert validate_vapid_public_key(LEGACY_PUBLIC) is False


def test_valid_generated_public_key():
    assert validate_vapid_public_key(VALID_PUBLIC) is True
    assert validate_vapid_private_key(VALID_PRIVATE) is True
    assert public_key_for_browser(VALID_PUBLIC) == VALID_PUBLIC


def test_strips_quotes_and_whitespace():
    wrapped = f'  "{VALID_PUBLIC}"  '
    assert public_key_for_browser(wrapped) == VALID_PUBLIC


def test_derive_public_from_private_matches_known_pair():
    derived = derive_public_key_from_private(VALID_PRIVATE)
    assert derived == VALID_PUBLIC


def test_vapid_env_configured_with_private_only():
    assert vapid_env_configured(VALID_PRIVATE, "") is True


def test_env_public_mismatch_detected():
    wrong = "BIqzYsOiaU0RBVVaN4RhsJCnGp02QO9T8PywY08zvg9js83aK7J3Pd4_YkW66BO1CGYAYFiTzDIrSdPYeBXh5Ox"
    assert env_public_matches_derived(VALID_PRIVATE, wrong) is False
    assert env_public_matches_derived(VALID_PRIVATE, VALID_PUBLIC) is True
