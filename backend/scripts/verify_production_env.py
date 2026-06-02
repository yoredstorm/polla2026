#!/usr/bin/env python3
"""
Validate production environment variables before deploy.
Exit 0 if OK, 1 with messages on stderr otherwise.

Usage (from backend/):
  APP_ENV=production JWT_SECRET_KEY=... JWT_REFRESH_SECRET=... CORS_ORIGINS=https://example.com \\
    python scripts/verify_production_env.py
"""
from __future__ import annotations

import os
import sys


def _fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)


def main() -> int:
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env != "production":
        _fail("APP_ENV must be 'production' (got {!r})".format(app_env or "(empty)"))
        return 1

    jwt_access = os.getenv("JWT_SECRET_KEY", "").strip()
    jwt_refresh = os.getenv("JWT_REFRESH_SECRET", "").strip()
    if len(jwt_access) < 43:
        _fail("JWT_SECRET_KEY must be set in environment with length >= 43")
        return 1
    if len(jwt_refresh) < 43:
        _fail("JWT_REFRESH_SECRET must be set in environment with length >= 43")
        return 1
    if jwt_access == jwt_refresh:
        _fail("JWT_REFRESH_SECRET must differ from JWT_SECRET_KEY")
        return 1

    cors = os.getenv("CORS_ORIGINS", "").strip()
    if not cors:
        _fail("CORS_ORIGINS must list at least one HTTPS origin")
        return 1

    origins = [o.strip() for o in cors.split(",") if o.strip()]
    for origin in origins:
        if origin == "*":
            _fail("CORS_ORIGINS must not contain '*' when using credentials")
            return 1
        if not origin.startswith("https://"):
            _fail(f"CORS origin must use HTTPS in production: {origin!r}")
            return 1

    if os.getenv("DEBUG", "false").strip().lower() in ("1", "true", "yes"):
        _fail("DEBUG must be false in production")
        return 1

    print("OK: production environment variables look valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
