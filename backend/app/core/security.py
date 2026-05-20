"""
Security module — OWASP compliant JWT, hashing, and token management.
A01, A02, A07 compliance.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.services import jwt_key_service

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    kid, secret = jwt_key_service.get_current_signing_key("access")
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(
        to_encode,
        secret,
        algorithm=settings.JWT_ALGORITHM,
        headers={"kid": kid},
    )


def create_refresh_token(data: dict) -> str:
    kid, secret = jwt_key_service.get_current_signing_key("refresh")
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "type": "refresh",
        "jti": secrets.token_urlsafe(16),
    })
    return jwt.encode(
        to_encode,
        secret,
        algorithm=settings.JWT_ALGORITHM,
        headers={"kid": kid},
    )


def _decode_with_keys(token: str, purpose: str, expected_type: str) -> Optional[dict]:
    keys = jwt_key_service.get_signing_keys_for_purpose(purpose)  # type: ignore[arg-type]
    header_kid = None
    try:
        header_kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        pass

    ordered: list[tuple[str, str]] = []
    if header_kid:
        match = next((k for k in keys if k[0] == header_kid), None)
        if match:
            ordered.append(match)
        ordered.extend(k for k in keys if k[0] != header_kid)
    else:
        ordered = list(keys)

    for _kid, secret in ordered:
        try:
            payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != expected_type:
                return None
            return payload
        except JWTError:
            continue
    return None


def decode_access_token(token: str) -> Optional[dict]:
    return _decode_with_keys(token, "access", "access")


def decode_refresh_token(token: str) -> Optional[dict]:
    return _decode_with_keys(token, "refresh", "refresh")


def hash_token(token: str) -> str:
    """Hash a refresh token for secure storage in DB. A02."""
    return hashlib.sha256(token.encode()).hexdigest()


def generate_invite_code() -> str:
    return secrets.token_urlsafe(12)


def generate_profile_bets_invite_code() -> str:
    return secrets.token_urlsafe(12)[:18]


def generate_temporary_password() -> str:
    """Temporary password meeting app rules: 8+ chars, uppercase, digit."""
    lower = secrets.token_hex(4)
    upper = secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ")
    digit = secrets.choice("23456789")
    return f"Tmp{upper}{digit}{lower}"
