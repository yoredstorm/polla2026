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
    # Remove any accidental whitespace inside the key
    s = re.sub(r"\s+", "", s)
    return s


def b64url_decode_padded(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + pad)


def validate_vapid_public_key(public_key: str) -> bool:
    """
    Browser PushManager requires a P-256 uncompressed point (65 bytes, leading 0x04).
    """
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


def public_key_for_browser(public_key: str) -> str:
    """Return normalized public key or raise ValueError."""
    normalized = normalize_vapid_key(public_key)
    if not validate_vapid_public_key(normalized):
        raise ValueError(
            "VAPID_PUBLIC_KEY invalida: debe ser base64url de 65 bytes (punto P-256 sin comprimir). "
            "Genera un par nuevo con: python scripts/generate_vapid_keys.py"
        )
    return normalized
