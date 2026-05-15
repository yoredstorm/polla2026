"""
Rate limiting — OWASP A04: Insecure Design prevention.
Uses SlowAPI (Starlette middleware) backed by Redis.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Limits defined per endpoint via decorator:
# @limiter.limit("5/minute") for login
# @limiter.limit("100/minute") for global

GLOBAL_RATE_LIMIT = "100/minute"
AUTH_LOGIN_RATE_LIMIT = "5/minute"
REGISTER_RATE_LIMIT = "10/minute"
