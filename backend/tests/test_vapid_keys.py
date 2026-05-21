"""VAPID key validation for Web Push."""
from app.services.vapid_keys import (
    validate_vapid_public_key,
    validate_vapid_private_key,
    public_key_for_browser,
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
