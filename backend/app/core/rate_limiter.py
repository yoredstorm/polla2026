"""
Rate limiting — OWASP A04: Insecure Design prevention.
SlowAPI with Redis storage when REDIS_URL is configured.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

_storage = settings.REDIS_URL if settings.REDIS_URL else None
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_storage,
    storage_options={"socket_connect_timeout": 2} if _storage else None,
)

GLOBAL_RATE_LIMIT = "100/minute"
AUTH_LOGIN_RATE_LIMIT = "5/minute"
REGISTER_RATE_LIMIT = "10/minute"
AUTH_REFRESH_RATE_LIMIT = "30/minute"
CHANGE_PASSWORD_RATE_LIMIT = "10/minute"
PASSWORD_RESET_REQUEST_RATE_LIMIT = "5/minute"
