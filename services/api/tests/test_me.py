"""GET /v1/me: the first protected route. It answers only for a verified token."""

import pytest
from fastapi.testclient import TestClient

from app.auth import get_jwks_cache
from app.jwks import JwksCache
from app.main import create_app
from app.settings import Settings, get_settings
from tests.fakes import FakeClock, FakeSupabase
from tests.keys import TestKey, make_token

SUPABASE_URL = "http://127.0.0.1:54321"
USER_ID = "11111111-2222-4333-8444-555555555555"


class MeEnv:
    """The real app, unchanged, with fake Supabase signing keys."""

    def __init__(self) -> None:
        self.key = TestKey("key-1")
        cache = JwksCache(
            FakeSupabase(self.key), ttl_seconds=600, min_refresh_seconds=30, clock=FakeClock()
        )
        app = create_app()
        settings = Settings(_env_file=None, supabase_url=SUPABASE_URL)
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_jwks_cache] = lambda: cache
        self.client = TestClient(app, raise_server_exceptions=False)

    def get(self, token: str | None = None):
        headers = {} if token is None else {"Authorization": f"Bearer {token}"}
        return self.client.get("/v1/me", headers=headers)


@pytest.fixture
def env() -> MeEnv:
    return MeEnv()


def test_a_valid_token_returns_the_callers_id(env: MeEnv) -> None:
    response = env.get(make_token(env.key))

    assert response.status_code == 200
    assert response.json() == {"id": USER_ID}


def test_the_id_comes_from_the_token_so_another_user_gets_their_own(env: MeEnv) -> None:
    other = "99999999-8888-4777-8666-555555555555"

    assert env.get(make_token(env.key, sub=other)).json() == {"id": other}


def test_the_response_does_not_echo_the_token(env: MeEnv) -> None:
    token = make_token(env.key)

    assert token not in env.get(token).text


def test_no_token_is_a_401_in_the_standard_error_shape(env: MeEnv) -> None:
    response = env.get()

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json() == {
        "error": {"code": "missing_token", "message": "Authentication required."}
    }


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("not-a-jwt", id="garbage"),
        pytest.param(make_token(TestKey("key-1")), id="signed-by-a-key-supabase-never-published"),
    ],
)
def test_an_invalid_token_is_a_401(env: MeEnv, token: str) -> None:
    response = env.get(token)

    assert response.status_code == 401
    assert response.headers["www-authenticate"].startswith('Bearer error="invalid_token"')
    assert response.json() == {
        "error": {"code": "invalid_token", "message": "The access token is invalid."}
    }


# TODO(victor): add a test that an expired token gets a 401 with the code `token_expired`, not
# `invalid_token`. Why it matters: the app should refresh the session on `token_expired` and send
# the user to sign in on `invalid_token`, so mixing the two up would sign people out for no reason.
# Hint: the Settings above allow 10 seconds of leeway, so make_token(env.key, exp=...) needs a
# time well past that. Look at how test_auth.py builds its expired tokens.
