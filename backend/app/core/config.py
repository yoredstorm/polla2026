from pydantic_settings import BaseSettings
from pydantic import field_validator, model_validator
from typing import List
import os
import secrets


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    DEBUG: bool = False
    SECRET_KEY: str = ""  # optional legacy; not used by JWT (see JWT_SECRET_KEY)

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://polla_user:password@localhost:5432/polla_db"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT (bootstrap / fallback when DB keys empty)
    JWT_SECRET_KEY: str = ""
    JWT_REFRESH_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # JWT key rotation (production)
    JWT_KEY_ROTATION_ENABLED: bool = False
    JWT_KEY_ROTATION_DAYS: int = 7
    JWT_KEY_GRACE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost,http://127.0.0.1"

    # Sentry
    SENTRY_DSN: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 100
    LOGIN_RATE_LIMIT_PER_MINUTE: int = 5
    LOGIN_BLOCK_DURATION_SECONDS: int = 900

    # Social spam
    SOCIAL_COMMENT_BURST_LIMIT: int = 8
    SOCIAL_COMMENT_BURST_WINDOW_SEC: int = 120

    # Avatar uploads
    AVATAR_UPLOAD_DIR: str = "/app/uploads/avatars"
    AVATAR_MAX_BYTES: int = 1_048_576

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v

    @model_validator(mode="after")
    def ensure_jwt_secrets_and_production_rules(self) -> "Settings":
        if not self.JWT_SECRET_KEY:
            object.__setattr__(self, "JWT_SECRET_KEY", secrets.token_urlsafe(48))
        if not self.JWT_REFRESH_SECRET:
            object.__setattr__(self, "JWT_REFRESH_SECRET", secrets.token_urlsafe(48))

        if self.APP_ENV == "production":
            if not os.getenv("JWT_SECRET_KEY") or len(self.JWT_SECRET_KEY) < 43:
                raise ValueError(
                    "JWT_SECRET_KEY must be set in environment for production (use scripts/generate_secrets.py)"
                )
            if not os.getenv("JWT_REFRESH_SECRET") or len(self.JWT_REFRESH_SECRET) < 43:
                raise ValueError(
                    "JWT_REFRESH_SECRET must be set in environment for production"
                )
            object.__setattr__(self, "JWT_KEY_ROTATION_ENABLED", True)
        return self

    @property
    def jwt_rotation_enabled(self) -> bool:
        return self.JWT_KEY_ROTATION_ENABLED and self.APP_ENV == "production"

    def get_cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
