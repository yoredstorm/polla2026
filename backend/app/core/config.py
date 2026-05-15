from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import secrets


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(32)

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://polla_user:password@localhost:5432/polla_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_REFRESH_SECRET: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # API Football
    FOOTBALL_API_KEY: str = ""
    FOOTBALL_API_HOST: str = "api-football-v1.p.rapidapi.com"
    FOOTBALL_API_BASE_URL: str = "https://api-football-v1.p.rapidapi.com/v3"

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1"

    # Sentry
    SENTRY_DSN: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 100
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 5
    LOGIN_BLOCK_DURATION_SECONDS: int = 900  # 15 min

    # Leagues to sync
    SUPPORTED_LEAGUES: List[int] = [39, 140, 2, 13, 262]  # PL, LaLiga, UCL, Libertadores, Liga MX
    CURRENT_SEASON: int = 2024

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v

    def get_cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    # SSRF whitelist
    ALLOWED_EXTERNAL_HOSTS: List[str] = ["api-football-v1.p.rapidapi.com"]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
