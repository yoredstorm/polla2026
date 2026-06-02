"""
Test configuration and fixtures.
Uses SQLite in-memory DB for fast isolated tests.
"""
import asyncio
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base, get_db
from app.models.jwt_signing_key import JwtSigningKey  # noqa: F401 — register metadata
from app.models.phase_winner import PhaseWinnerHistory  # noqa: F401 — register metadata
from app.models.group_phase import (  # noqa: F401
    GroupPhaseFee,
    GroupPhaseEnrollment,
    GroupPhaseEntryProof,
)
from app.core.rate_limiter import limiter

# Use SQLite in-memory for tests (no PostgreSQL required)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


def get_api_error_code(body: dict) -> str:
    """Extract error code from API JSON (top-level `error` or legacy `detail.error`)."""
    err = body.get("error")
    if isinstance(err, dict) and err.get("code"):
        return str(err["code"])
    detail = body.get("detail")
    if isinstance(detail, dict):
        nested = detail.get("error")
        if isinstance(nested, dict) and nested.get("code"):
            return str(nested["code"])
    raise AssertionError(f"No error code in response body: {body!r}")


def assert_api_error(response, expected_code: str, *, status: int | None = None) -> None:
    if status is not None:
        assert response.status_code == status
    assert get_api_error_code(response.json()) == expected_code


def register_payload(
    username: str,
    password: str = "SecurePass1",
    first_name: str = "Test",
    last_name: str = "User",
) -> dict:
    return {
        "username": username,
        "password": password,
        "first_name": first_name,
        "last_name": last_name,
    }


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine):
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiting for tests so consecutive requests don't get 429
    limiter.enabled = False
    try:
        # Use https scheme so httpx sends Secure cookies back with requests
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="https://test",
        ) as c:
            yield c
    finally:
        limiter.enabled = True
        app.dependency_overrides.clear()
