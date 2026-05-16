#!/usr/bin/env python3
"""
Generate high-entropy secrets for .env (run locally; never commit output).

Usage:
  python scripts/generate_secrets.py
  python scripts/generate_secrets.py >> .env.local.new
"""
from __future__ import annotations

import secrets


def main() -> None:
    print("# Paste into backend/.env (server / secrets manager only — never commit)")
    print(f"JWT_SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"JWT_REFRESH_SECRET={secrets.token_urlsafe(48)}")
    print("# Infra (also rotate via your DB/Redis operator playbook):")
    print(f"# POSTGRES_PASSWORD={secrets.token_urlsafe(24)}")
    print(f"# REDIS_PASSWORD={secrets.token_urlsafe(24)}")


if __name__ == "__main__":
    main()
