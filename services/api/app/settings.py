"""Configuration, read from environment variables and from services/api/.env when it exists.

Real values never go in code or in git. `.env.example` lists the names.
"""

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # .env also holds keys the API doesn't read yet (the secret key, USDA, Anthropic), so unknown
    # keys are ignored.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The project's base URL, written exactly as `npx supabase status` shows it. The issuer inside
    # every token is built from this URL, so "localhost" instead of "127.0.0.1" makes every local
    # token fail verification.
    supabase_url: str

    # How long fetched signing keys are trusted. Supabase tells caches 10 minutes.
    jwks_cache_seconds: int = Field(default=600, ge=1)
    # Unknown key ids can trigger a refetch. This is the shortest gap allowed between refetches, so
    # a client sending random key ids can't make the API hammer Supabase.
    jwks_min_refresh_seconds: int = Field(default=30, ge=1)

    # Allowed clock difference, in seconds, between this server and Supabase when checking token
    # times.
    # TODO(victor): reject values below 0 or above 60 by using Field(default=10, ge=0, le=60).
    # Hint: jwks_cache_seconds above shows the pattern. Then add a test in tests/test_settings.py.
    jwt_leeway_seconds: int = 10

    @field_validator("supabase_url")
    @classmethod
    def _normalize_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("must start with http:// or https://")
        return value

    @property
    def auth_issuer(self) -> str:
        """The `iss` claim every token from this project carries."""
        return f"{self.supabase_url}/auth/v1"

    @property
    def jwks_url(self) -> str:
        """Where the project publishes the public keys that verify its tokens."""
        return f"{self.auth_issuer}/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
