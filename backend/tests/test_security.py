"""
Unit tests for security module (OWASP A02 compliance).
Pure functions — no DB or network required.
"""
import pytest
from datetime import timedelta

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_token,
    generate_invite_code,
)


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        h = hash_password("MySecret1!")
        assert h != "MySecret1!"

    def test_verify_correct_password(self):
        h = hash_password("CorrectHorse!")
        assert verify_password("CorrectHorse!", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("CorrectHorse!")
        assert verify_password("WrongHorse!", h) is False

    def test_two_hashes_are_different(self):
        # bcrypt uses a random salt each time
        h1 = hash_password("SamePass1!")
        h2 = hash_password("SamePass1!")
        assert h1 != h2


class TestAccessToken:
    def test_create_and_decode_success(self):
        token = create_access_token({"sub": "user-123"})
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == "user-123"
        assert payload["type"] == "access"

    def test_decode_expired_token_returns_none(self):
        token = create_access_token({"sub": "user-123"}, expires_delta=timedelta(seconds=-1))
        result = decode_access_token(token)
        assert result is None

    def test_wrong_secret_returns_none(self):
        from jose import jwt
        from app.core.config import settings
        token = jwt.encode({"sub": "x", "type": "access"}, "wrong-secret", algorithm=settings.JWT_ALGORITHM)
        assert decode_access_token(token) is None

    def test_refresh_token_rejected_as_access(self):
        refresh = create_refresh_token({"sub": "user-123"})
        assert decode_access_token(refresh) is None


class TestRefreshToken:
    def test_create_and_decode_success(self):
        token = create_refresh_token({"sub": "user-456"})
        payload = decode_refresh_token(token)
        assert payload is not None
        assert payload["sub"] == "user-456"
        assert payload["type"] == "refresh"

    def test_access_token_rejected_as_refresh(self):
        access = create_access_token({"sub": "user-456"})
        assert decode_refresh_token(access) is None

    def test_garbage_token_returns_none(self):
        assert decode_refresh_token("not.a.token") is None
        assert decode_access_token("not.a.token") is None


class TestHashToken:
    def test_deterministic(self):
        t = "sometoken"
        assert hash_token(t) == hash_token(t)

    def test_different_inputs_differ(self):
        assert hash_token("abc") != hash_token("def")

    def test_is_hex_string(self):
        result = hash_token("test")
        assert len(result) == 64  # SHA-256 hex digest
        int(result, 16)  # must be valid hex


class TestInviteCode:
    def test_generates_string(self):
        code = generate_invite_code()
        assert isinstance(code, str)
        assert len(code) > 0

    def test_unique_each_call(self):
        codes = {generate_invite_code() for _ in range(10)}
        assert len(codes) == 10  # all unique
