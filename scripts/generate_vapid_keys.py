#!/usr/bin/env python3
"""Generate VAPID key pair for Web Push (URL-safe base64, 65-byte public point)."""
from __future__ import annotations

import base64
import sys

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric import ec


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + pad)


def generate_vapid_key_pair() -> tuple[str, str]:
    private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
    public_key = private_key.public_key()
    numbers = public_key.public_numbers()
    uncompressed = b"\x04" + numbers.x.to_bytes(32, "big") + numbers.y.to_bytes(32, "big")
    if len(uncompressed) != 65:
        raise RuntimeError(f"unexpected public key length: {len(uncompressed)}")

    private_value = private_key.private_numbers().private_value.to_bytes(32, "big")
    return b64url_encode(uncompressed), b64url_encode(private_value)


def validate_public_key(public_key: str) -> bool:
    try:
        raw = b64url_decode(public_key.strip().strip('"').strip("'"))
    except Exception:
        return False
    return len(raw) == 65 and raw[0] == 0x04


def main() -> int:
    public_key, private_key = generate_vapid_key_pair()
    assert validate_public_key(public_key)

    print("Add to Dokploy / backend .env and root .env for docker-compose:\n")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    print("VAPID_CLAIMS_SUB=mailto:admin@redcardtech.uk")
    print("\nRedeploy backend after saving. Users must re-activate push on each device.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
