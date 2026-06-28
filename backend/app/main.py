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
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.cors_utils import cors_headers_for_request
from app.core.middlewares import SecurityHeadersMiddleware, RequestLoggingMiddleware
from app.core.rate_limiter import limiter
from app.api.v1 import admin, auth, fixtures, bets, groups, users, leaderboard, notifications, ws, challenges, activity, badges, social, site, competitions, c_scoped, c_admin, admin_live_sync
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


async def _fixture_betting_close_loop() -> None:
    from app.db.session import AsyncSessionLocal
    from app.services.betting_close_service import (
        close_due_fixtures_batch,
        warn_fixtures_betting_closing_soon,
    )

    while True:
        try:
            redis = await get_redis()
            async with AsyncSessionLocal() as db:
                try:
                    await warn_fixtures_betting_closing_soon(db, redis)
                    n = await close_due_fixtures_batch(db, redis)
                    if n:
                        await db.commit()
                    else:
                        await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("fixture_betting_close_tick_failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("fixture_betting_close_loop_failed")
        try:
            await asyncio.sleep(15)
        except asyncio.CancelledError:
            raise


async def _change_request_expiry_loop() -> None:
    from app.db.session import AsyncSessionLocal
    from app.services.change_request_expiry import expire_pending_change_requests

    while True:
        try:
            redis = await get_redis()
            async with AsyncSessionLocal() as db:
                try:
                    await expire_pending_change_requests(db, redis)
                    await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("change_request_expiry_tick_failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("change_request_expiry_loop_failed")
        try:
            await asyncio.sleep(15)
        except asyncio.CancelledError:
            raise


async def _fixture_live_sync_loop() -> None:
    from app.db.session import AsyncSessionLocal
    from app.services.fixture_live_sync_service import run_live_sync_tick

    while True:
        try:
            redis = await get_redis()
            async with AsyncSessionLocal() as db:
                try:
                    n = await run_live_sync_tick(db, redis)
                    if n:
                        await db.commit()
                    else:
                        await db.commit()
                except Exception:
                    await db.rollback()
                    logger.exception("fixture_live_sync_tick_failed")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("fixture_live_sync_loop_failed")
        try:
            await asyncio.sleep(15)
        except asyncio.CancelledError:
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
            from app.services.competition_service import get_default_competition

            default_comp = await get_default_competition(db)
            count_result = await db.execute(select(func.count()).select_from(Fixture))
            total = count_result.scalar()
            if total == 0 and default_comp:
                logger.info("seeding_worldcup_fixtures", competition_id=str(default_comp.id))
                records = load_fixtures(competition_id=default_comp.id)
                for data in records:
                    await _upsert_fixture(db, data)
                await db.commit()
                logger.info("worldcup_fixtures_seeded", count=len(records))
            elif total == 0:
                logger.info("seeding_worldcup_fixtures")
                records = load_fixtures()
                for data in records:
                    await _upsert_fixture(db, data)
                await db.commit()
                logger.info("worldcup_fixtures_seeded", count=len(records))
    except Exception as exc:
        logger.error("fixture_seed_failed", error=str(exc))

    try:
        from app.services.jwt_key_service import (
            bootstrap_signing_keys,
            reload_signing_keys_cache,
            rotate_signing_keys_if_due,
            jwt_key_rotation_loop,
        )
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            await bootstrap_signing_keys(db)
            redis = await get_redis()
            await rotate_signing_keys_if_due(db, redis)
            await reload_signing_keys_cache(db)
            await db.commit()
    except Exception as exc:
        logger.error("jwt_keys_bootstrap_failed", error=str(exc))

    listener_task = asyncio.create_task(_redis_notification_listener())
    expiry_task = asyncio.create_task(_change_request_expiry_loop())
    betting_close_task = asyncio.create_task(_fixture_betting_close_loop())
    live_sync_task = asyncio.create_task(_fixture_live_sync_loop())
    jwt_rotation_task = asyncio.create_task(jwt_key_rotation_loop())
    yield
    jwt_rotation_task.cancel()
    live_sync_task.cancel()
    betting_close_task.cancel()
    expiry_task.cancel()
    listener_task.cancel()
    for task in (jwt_rotation_task, live_sync_task, betting_close_task, expiry_task, listener_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
    logger.info("app_stopping")


_is_prod = settings.APP_ENV == "production"
app = FastAPI(
    title="Polla de Apuestas API",
    description="Sports betting pool API — OWASP Top 10 compliant",
    version="1.0.0",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
    lifespan=lifespan,
    debug=False,
)

# Rate limiter state
app.state.limiter = limiter

# Middleware: first registered = outermost. CORS must wrap SlowAPI/errors so every response has ACAO.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),  # A05: Strict whitelist
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

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
        before_send=lambda event, hint: __import__(
            "app.core.sentry_scrub", fromlist=["scrub_sentry_event"]
        ).scrub_sentry_event(event, hint),
    )

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        content = detail
    elif isinstance(detail, dict):
        content = {"error": {"code": "HTTP_ERROR", "message": str(detail)}}
    else:
        content = {"error": {"code": "HTTP_ERROR", "message": str(detail)}}
    return JSONResponse(
        status_code=exc.status_code,
        headers=cors_headers_for_request(request),
        content=content,
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        headers=cors_headers_for_request(request),
        content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down.", "detail": str(exc.detail)}},
    )

# Generic error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        headers=cors_headers_for_request(request),
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
app.include_router(admin_live_sync.router, prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(ws.router, prefix=PREFIX)
app.include_router(challenges.router, prefix=PREFIX)
app.include_router(activity.router, prefix=PREFIX)
app.include_router(badges.router, prefix=PREFIX)
app.include_router(social.router, prefix=PREFIX)
app.include_router(site.router, prefix=PREFIX)
app.include_router(competitions.router, prefix=PREFIX)
app.include_router(c_scoped.router, prefix=PREFIX)
app.include_router(c_admin.router, prefix=PREFIX)


@app.get("/health")
async def health_check():
    # A05: No sensitive info in health endpoint
    return {"status": "ok"}
