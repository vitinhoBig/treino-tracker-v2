"""GET /v1/me against a real, local Supabase: the one test that proves a token Supabase issued
is accepted by this API. It skips itself when the local stack isn't running, so CI stays green.

Run it with `npx supabase start`. The publishable key comes from SUPABASE_PUBLISHABLE_KEY, or
from `npx supabase status` when that isn't set.
"""

import json
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import _cache_for
from app.main import create_app
from app.settings import Settings, get_settings

REPO_ROOT = Path(__file__).resolve().parents[3]
# Written exactly as `npx supabase status` shows it, because tokens carry it as their issuer.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def _publishable_key() -> str | None:
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if key:
        return key
    try:
        status = subprocess.run(
            ["npx", "--no-install", "supabase", "status", "-o", "json"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return json.loads(status.stdout).get("PUBLISHABLE_KEY")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def _skip_reason() -> str | None:
    # This test creates a user, so it must never point at a hosted project.
    if urlparse(SUPABASE_URL).hostname not in LOCAL_HOSTS:
        return f"SUPABASE_URL ({SUPABASE_URL}) is not a local address, so no test user is created"
    try:
        httpx.get(f"{SUPABASE_URL}/auth/v1/health", timeout=2).raise_for_status()
    except httpx.HTTPError:
        return f"local Supabase is not running at {SUPABASE_URL} (start it: npx supabase start)"
    if _publishable_key() is None:
        return "no publishable key: set SUPABASE_PUBLISHABLE_KEY or run `npx supabase status`"
    return None


_SKIP_REASON = _skip_reason()

pytestmark = pytest.mark.skipif(_SKIP_REASON is not None, reason=_SKIP_REASON or "")


def _sign_up_and_get_access_token() -> tuple[str, str]:
    """Creates a throwaway user and returns (user id, access token), as the app's login would."""
    response = httpx.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers={"apikey": _publishable_key() or ""},
        json={
            "email": f"api-test-{uuid4().hex[:12]}@example.test",
            "password": secrets.token_hex(16),
        },
        timeout=10,
    )
    response.raise_for_status()
    body = response.json()
    return body["user"]["id"], body["access_token"]


def test_me_accepts_a_real_token_issued_by_supabase() -> None:
    user_id, access_token = _sign_up_and_get_access_token()
    app = create_app()
    settings = Settings(_env_file=None, supabase_url=SUPABASE_URL)
    app.dependency_overrides[get_settings] = lambda: settings
    _cache_for.cache_clear()  # Fetch the stack's real signing keys, not a cached earlier set.

    response = TestClient(app).get("/v1/me", headers={"Authorization": f"Bearer {access_token}"})

    assert response.status_code == 200
    assert response.json() == {"id": user_id}


# TODO(victor): add a test that the same real token is rejected with a 401 `invalid_token` once
# its signature is altered. Why it matters: the unit tests prove this with keys we generated, but
# only this test can show it holds for the keys Supabase really signs with.
# Hint: a JWT is three dot-separated parts. Change a character in the middle of the last one (not
# the final character, which may only change padding bits), and reuse the helper above.
