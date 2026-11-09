"""Settings: where the Supabase URLs come from, and what's rejected."""

import pytest
from pydantic import ValidationError

from app.settings import Settings, get_settings


def settings(**values) -> Settings:
    # _env_file=None keeps a developer's real services/api/.env out of the tests.
    return Settings(_env_file=None, **values)


def test_the_issuer_and_key_url_are_built_from_the_project_url() -> None:
    s = settings(supabase_url="http://127.0.0.1:54321")

    assert s.auth_issuer == "http://127.0.0.1:54321/auth/v1"
    assert s.jwks_url == "http://127.0.0.1:54321/auth/v1/.well-known/jwks.json"


def test_trailing_slashes_and_spaces_are_removed() -> None:
    s = settings(supabase_url="  https://abc.supabase.co//  ")

    assert s.supabase_url == "https://abc.supabase.co"
    assert s.auth_issuer == "https://abc.supabase.co/auth/v1"


def test_the_project_url_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="supabase_url"):
        settings()


@pytest.mark.parametrize("bad", ["", "127.0.0.1:54321", "ftp://example.com", "file:///etc/passwd"])
def test_urls_that_are_not_http_are_rejected(bad: str) -> None:
    with pytest.raises(ValidationError):
        settings(supabase_url=bad)


def test_values_come_from_environment_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://from-env.supabase.co")
    monkeypatch.setenv("JWKS_CACHE_SECONDS", "42")

    s = settings()

    assert s.supabase_url == "https://from-env.supabase.co"
    assert s.jwks_cache_seconds == 42


def test_an_env_file_works_and_its_other_keys_are_ignored(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text("SUPABASE_URL=https://from-file.supabase.co\nUSDA_API_KEY=not-read-yet\n")

    s = Settings(_env_file=env_file)

    assert s.supabase_url == "https://from-file.supabase.co"


def test_defaults_match_what_supabase_tells_caches() -> None:
    s = settings(supabase_url="http://127.0.0.1:54321")

    assert s.jwks_cache_seconds == 600
    assert s.jwks_min_refresh_seconds == 30
    assert s.jwt_leeway_seconds == 10


@pytest.mark.parametrize("field", ["jwks_cache_seconds", "jwks_min_refresh_seconds"])
def test_cache_times_must_be_positive(field: str) -> None:
    with pytest.raises(ValidationError):
        settings(supabase_url="http://127.0.0.1:54321", **{field: 0})


def test_get_settings_is_created_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "http://127.0.0.1:54321")
    get_settings.cache_clear()
    try:
        assert get_settings() is get_settings()
    finally:
        get_settings.cache_clear()
