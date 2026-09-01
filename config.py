"""
Central config for Crisis Room's authenticated product area.

Everything here is read from the environment (optionally via a git-ignored
`.env` at the repo root). None of it is required for the `/console` demo
surface — that path has no accounts, no database, no notifiers.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- sessions / auth ---
    session_secret: str = Field(
        default="dev-only-insecure-secret-change-me",
        description="Signs the JWT session cookie. Set SESSION_SECRET in .env.",
    )
    jwt_algorithm: str = "HS256"
    session_ttl_hours: int = 24 * 7
    session_cookie_name: str = "crisis_room_session"
    session_cookie_secure: bool = False  # True behind HTTPS in production

    # --- database ---
    database_url: str = "sqlite:///./crisis_room.db"

    # --- CORS (authenticated endpoints send cookies, so origins must be explicit) ---
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    public_app_url: str = "http://localhost:3000"

    # --- synthetic monitor defaults ---
    monitor_poll_interval_seconds: int = 30
    monitor_window_size: int = 10

    # Controllable probe endpoints under /api/dev/* for exercising the monitor
    # locally without a real degrading site. Turn off in any real deployment.
    enable_devtools: bool = True

    # A real service Crisis Room actually controls (integrations/target_service.py):
    # real faults, real control API, real fixes. Mounted at /api/target/*.
    # Incidents for this target get RealTargetExecutor (an actual remediation);
    # incidents for any other URL get recommend-only + a labeled projection.
    enable_demo_target: bool = True
    demo_target_base_url: str = "http://localhost:8000"

    # --- notifiers (Phase 4) ---
    resend_api_key: str | None = None
    resend_from_email: str = "Crisis Room <onboarding@resend.dev>"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def session_secret_is_default(self) -> bool:
        return self.session_secret == "dev-only-insecure-secret-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
