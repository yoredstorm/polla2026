"""VAPID key normalization and validation for Web Push."""
from __future__ import annotations

import base64
import re


def normalize_vapid_key(value: str) -> str:
    """Strip whitespace, quotes, and PEM headers if pasted by mistake."""
    s = value.strip().strip('"').strip("'")
    if "BEGIN" in s:
        lines = [ln for ln in s.splitlines() if not ln.startswith("-----")]
        s = "".join(lines)
    s = re.sub(r"\s+", "", s)
    return s


def b64url_decode_padded(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + pad)


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def validate_vapid_public_key(public_key: str) -> bool:
    """Browser PushManager requires a P-256 uncompressed point (65 bytes, leading 0x04)."""
    try:
        raw = b64url_decode_padded(normalize_vapid_key(public_key))
    except Exception:
        return False
    return len(raw) == 65 and raw[0] == 0x04


def validate_vapid_private_key(private_key: str) -> bool:
    try:
        raw = b64url_decode_padded(normalize_vapid_key(private_key))
    except Exception:
        return False
    return len(raw) == 32


def load_vapid_from_private(private_key: str):
    """Load py_vapid instance from private key string (raw 32-byte or PKCS#8 DER base64)."""
    from py_vapid import Vapid

    normalized = normalize_vapid_key(private_key)
    if not normalized:
        raise ValueError("VAPID_PRIVATE_KEY vacia")
    return Vapid.from_string(private_key=normalized)


def derive_public_key_from_private(private_key: str) -> str:
    """
    Derive the browser applicationServerKey from the private key.
    Always use this for PushManager.subscribe so PUBLIC/PRIVATE env cannot mismatch.
    """
    from cryptography.hazmat.primitives import serialization

    vapid = load_vapid_from_private(private_key)
    pub_bytes = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    encoded = b64url_encode(pub_bytes)
    if not validate_vapid_public_key(encoded):
        raise ValueError("No se pudo derivar una clave publica VAPID valida desde la privada")
    return encoded


def public_key_for_browser(public_key: str) -> str:
    """Return normalized public key or raise ValueError."""
    normalized = normalize_vapid_key(public_key)
    if not validate_vapid_public_key(normalized):
        raise ValueError(
            "VAPID_PUBLIC_KEY invalida: debe ser base64url de 65 bytes (punto P-256 sin comprimir). "
            "Genera un par nuevo con: python scripts/generate_vapid_keys.py"
        )
    return normalized


def vapid_env_configured(private_key: str, public_key: str) -> bool:
    priv = normalize_vapid_key(private_key or "")
    if not priv:
        return False
    try:
        load_vapid_from_private(priv)
        derive_public_key_from_private(priv)
        return True
    except Exception:
        return False


def env_public_matches_derived(private_key: str, public_key: str) -> bool:
    """True if VAPID_PUBLIC_KEY matches the key derived from VAPID_PRIVATE_KEY."""
    env_pub = normalize_vapid_key(public_key or "")
    if not env_pub:
        return True
    try:
        derived = derive_public_key_from_private(private_key)
        return env_pub == derived
    except Exception:
        return False
