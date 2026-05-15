"""
FastAPI application entry point.
OWASP compliant security stack.
"""
import asyncio
import json
import uuid
import structlog
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.middlewares import SecurityHeadersMiddleware, RequestLoggingMiddleware
from app.core.rate_limiter import limiter
from app.api.v1 import admin, auth, fixtures, bets, groups, users, leaderboard, notifications, ws
from app.db.session import get_redis
from app.services.ws_manager import ws_manager

# Configure structlog
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)

logger = structlog.get_logger(__name__)


async def _redis_notification_listener() -> None:
    redis = await get_redis()
    pubsub = redis.pubsub()
    await pubsub.subscribe("notifications")
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                data = json.loads(message["data"])
                user_id = uuid.UUID(data["user_id"])
                await ws_manager.send_to_user(user_id, json.dumps(data["event"], default=str))
            await asyncio.sleep(0.05)
    except asyncio.CancelledError:
        await pubsub.unsubscribe("notifications")
        await pubsub.aclose()
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("app_starting", env=settings.APP_ENV)
    # Auto-seed World Cup fixtures if the table is empty
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.fixture import Fixture
        from sqlalchemy import select, func
        from app.services.worldcup_loader import load_fixtures
        from app.api.v1.fixtures import _upsert_fixture

        async with AsyncSessionLocal() as db:
            count_result = await db.execute(select(func.count()).select_from(Fixture))
            total = count_result.scalar()
            if total == 0:
                logger.info("seeding_worldcup_fixtures")
                records = load_fixtures()
                for data in records:
                    await _upsert_fixture(db, data)
                await db.commit()
                logger.info("worldcup_fixtures_seeded", count=len(records))
    except Exception as exc:
        logger.error("fixture_seed_failed", error=str(exc))

    listener_task = asyncio.create_task(_redis_notification_listener())
    yield
    listener_task.cancel()
    try:
        await listener_task
    except asyncio.CancelledError:
        pass
    logger.info("app_stopping")


app = FastAPI(
    title="Polla de Apuestas API",
    description="Sports betting pool API — OWASP Top 10 compliant",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    debug=False,  # A05: Never enable debug in production
)

# Rate limiter state
app.state.limiter = limiter

# Middleware stack (order matters: outermost first)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),  # A05: Strict whitelist
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)

# Sentry integration (A09)
if settings.SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        integrations=[FastApiIntegration()],
        traces_sample_rate=0.1,
        environment=settings.APP_ENV,
        # A09: Never send sensitive data
        before_send=lambda event, hint: event,
    )

# Rate limit exceeded handler
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down.", "detail": str(exc.detail)}},
    )

# Generic error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred"}},
    )

# Include routers
PREFIX = "/api/v1"
app.include_router(auth.router, prefix=PREFIX)
app.include_router(fixtures.router, prefix=PREFIX)
app.include_router(bets.router, prefix=PREFIX)
app.include_router(groups.router, prefix=PREFIX)
app.include_router(users.router, prefix=PREFIX)
app.include_router(leaderboard.router, prefix=PREFIX)
app.include_router(admin.router, prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(ws.router, prefix=PREFIX)


@app.get("/health")
async def health_check():
    # A05: No sensitive info in health endpoint
    return {"status": "ok"}
