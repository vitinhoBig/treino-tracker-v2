"""Token verification: what gets in, and every way something is kept out."""

import json
import time
from collections.abc import Callable
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app.auth import CurrentUser, _cache_for, get_jwks_cache
from app.jwks import JwksCache
from app.main import create_app
from app.settings import Settings, get_settings
from tests.fakes import FakeClock, FakeSupabase
from tests.keys import TestKey, forge, make_token, sign_raw

SUPABASE_URL = "http://127.0.0.1:54321"
ISSUER = f"{SUPABASE_URL}/auth/v1"
USER_ID = "11111111-2222-4333-8444-555555555555"

# Generating an RSA key is slow, so one is shared by every test that needs it.
RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class Env:
    """The real app plus a route that returns who the caller is, with fake Supabase keys."""

    def __init__(self) -> None:
        self.key = TestKey("key-1")
        self.supabase = FakeSupabase(self.key)
        self.clock = FakeClock()
        self.cache = JwksCache(
            self.supabase, ttl_seconds=600, min_refresh_seconds=30, clock=self.clock
        )
        app = create_app()
        settings = Settings(_env_file=None, supabase_url=SUPABASE_URL)
        app.dependency_overrides[get_settings] = lambda: settings
        app.dependency_overrides[get_jwks_cache] = lambda: self.cache

        @app.get("/test/whoami")
        def whoami(user: CurrentUser) -> dict[str, str]:
            return {"id": str(user.id), "user": repr(user)}

        self.client = TestClient(app, raise_server_exceptions=False)

    def get(self, token: str | None = None, scheme: str = "Bearer"):
        headers = {} if token is None else {"Authorization": f"{scheme} {token}"}
        return self.client.get("/test/whoami", headers=headers)

    def claims(self) -> dict[str, Any]:
        return {
            "iss": ISSUER,
            "aud": "authenticated",
            "sub": USER_ID,
            "role": "authenticated",
            "exp": int(time.time()) + 3600,
        }

    def publish_rsa_key(self) -> None:
        jwk = jwt.algorithms.RSAAlgorithm.to_jwk(RSA_KEY.public_key(), as_dict=True)
        self.supabase.document["keys"].append({**jwk, "kid": "rsa-1", "alg": "RS256"})


@pytest.fixture
def env() -> Env:
    return Env()


def error_of(response) -> dict[str, Any]:
    body = response.json()
    assert list(body) == ["error"]
    return body["error"]


def public_key_pem(key: TestKey) -> bytes:
    return key.private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )


# --- Accepted ---------------------------------------------------------------------------------


def test_a_valid_token_identifies_the_user(env: Env) -> None:
    response = env.get(make_token(env.key))

    assert response.status_code == 200
    assert response.json()["id"] == USER_ID


def test_a_normal_account_marked_not_anonymous_is_accepted(env: Env) -> None:
    assert env.get(make_token(env.key, is_anonymous=False)).status_code == 200


def test_an_rsa_signed_token_works_when_supabase_publishes_an_rsa_key(env: Env) -> None:
    env.publish_rsa_key()
    token = make_token(env.key, algorithm="RS256", signing_key=RSA_KEY, kid="rsa-1")

    assert env.get(token).status_code == 200


def test_the_scheme_name_is_case_insensitive(env: Env) -> None:
    assert env.get(make_token(env.key), scheme="bearer").status_code == 200


def test_a_token_a_few_seconds_past_expiry_is_accepted_within_the_clock_allowance(env: Env) -> None:
    assert env.get(make_token(env.key, exp=int(time.time()) - 5)).status_code == 200


def test_the_user_object_keeps_the_token_out_of_its_repr(env: Env) -> None:
    token = make_token(env.key)

    assert token not in env.get(token).json()["user"]


def test_public_routes_need_no_token() -> None:
    client = TestClient(create_app())

    assert client.get("/health").status_code == 200
    assert client.get("/v1/hello").status_code == 200


# --- Not signed in ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "headers", [{}, {"Authorization": "Bearer"}, {"Authorization": "Basic abc"}]
)
def test_a_missing_or_non_bearer_header_is_missing_token(env: Env, headers: dict[str, str]) -> None:
    response = env.client.get("/test/whoami", headers=headers)

    assert response.status_code == 401
    assert error_of(response)["code"] == "missing_token"
    assert response.headers["www-authenticate"] == "Bearer"


def test_an_expired_token_says_so_so_the_app_can_refresh(env: Env) -> None:
    response = env.get(make_token(env.key, exp=int(time.time()) - 60))

    assert response.status_code == 401
    assert error_of(response)["code"] == "token_expired"
    assert 'error="invalid_token"' in response.headers["www-authenticate"]


def test_an_anonymous_sign_in_is_refused_with_403(env: Env) -> None:
    response = env.get(make_token(env.key, is_anonymous=True))

    assert response.status_code == 403
    assert error_of(response)["code"] == "anonymous_user"


# --- Every way a token can be wrong -----------------------------------------------------------

# Each entry builds a token that must be rejected as invalid.
REJECTED: dict[str, Callable[[Env], str]] = {
    "not a token": lambda e: "not-a-jwt",
    "only two parts": lambda e: "abc.def",
    "wrong issuer": lambda e: make_token(e.key, issuer="https://evil.example/auth/v1"),
    "wrong audience": lambda e: make_token(e.key, aud="anon"),
    "no audience": lambda e: make_token(e.key, aud=None),
    "no issuer": lambda e: make_token(e.key, iss=None),
    "no expiry": lambda e: make_token(e.key, exp=None),
    "no subject": lambda e: make_token(e.key, sub=None),
    "subject is not a user id": lambda e: make_token(e.key, sub="not-a-uuid"),
    "service role": lambda e: make_token(e.key, role="service_role"),
    "anon role": lambda e: make_token(e.key, role="anon"),
    "no role": lambda e: make_token(e.key, role=None),
    # Signed by the real key, but with claims of the wrong type. These must be 401s, never a crash.
    "expiry is text": lambda e: make_token(e.key, exp="soon"),
    "audience is a number": lambda e: make_token(e.key, aud=5),
    "issuer is a list": lambda e: sign_raw(e.key, {**e.claims(), "iss": ["a", "b"]}),
    "issued-at is text": lambda e: make_token(e.key, iat="yesterday"),
    "subject is a list": lambda e: make_token(e.key, sub=["a"]),
    "role is a list": lambda e: make_token(e.key, role=["authenticated"]),
    "no key id": lambda e: make_token(e.key, kid=None),
    "unknown key id": lambda e: make_token(e.key, kid="not-published"),
    "signed by a different key": lambda e: make_token(
        e.key, signing_key=TestKey("attacker").private_key
    ),
    "claims tampered after signing": lambda e: tamper(make_token(e.key)),
    "unsigned (alg none)": lambda e: forge(
        {"alg": "none", "typ": "JWT", "kid": e.key.kid}, e.claims()
    ),
    "HS256 signed with the public key": lambda e: forge(
        {"alg": "HS256", "typ": "JWT", "kid": e.key.kid}, e.claims(), public_key_pem(e.key)
    ),
    "HS256 signed with the public JWK": lambda e: forge(
        {"alg": "HS256", "typ": "JWT", "kid": e.key.kid},
        e.claims(),
        json.dumps(e.key.jwk).encode(),
    ),
    "HS256 signed with any secret": lambda e: forge(
        {"alg": "HS256", "typ": "JWT", "kid": e.key.kid}, e.claims(), b"x" * 32
    ),
    "RSA token naming an EC key": lambda e: make_token(
        e.key, algorithm="RS256", signing_key=RSA_KEY
    ),
}


def tamper(token: str) -> str:
    """Swaps in a different payload but keeps the original signature."""
    header, _, signature = token.split(".")
    other = make_token(TestKey("other"), sub="99999999-2222-4333-8444-555555555555").split(".")[1]
    return f"{header}.{other}.{signature}"


@pytest.mark.parametrize("name", REJECTED)
def test_bad_tokens_are_rejected_as_invalid(env: Env, name: str) -> None:
    token = REJECTED[name](env)

    response = env.get(token)

    assert response.status_code == 401
    assert error_of(response) == {
        "code": "invalid_token",
        "message": "The access token is invalid.",
    }
    assert response.headers["www-authenticate"] == 'Bearer error="invalid_token"'
    assert token not in response.text


def test_the_reason_a_token_was_rejected_is_not_told_to_the_client(env: Env) -> None:
    messages = {
        env.get(REJECTED[name](env)).text
        for name in ("wrong issuer", "unknown key id", "anon role")
    }

    assert len(messages) == 1


@pytest.mark.parametrize(
    "name",
    ["unsigned (alg none)", "HS256 signed with the public key", "HS256 signed with any secret"],
)
def test_disallowed_algorithms_are_refused_before_any_key_is_fetched(env: Env, name: str) -> None:
    env.get(REJECTED[name](env))

    assert env.supabase.calls == 0


def test_made_up_key_ids_cannot_make_the_api_hammer_supabase(env: Env) -> None:
    for number in range(50):
        env.get(make_token(env.key, kid=f"made-up-{number}"))

    assert env.supabase.calls == 1


# --- Supabase being unreachable ---------------------------------------------------------------


def test_with_no_keys_and_supabase_down_the_answer_is_503_not_401(env: Env) -> None:
    env.supabase.failing = True

    response = env.get(make_token(env.key))

    assert response.status_code == 503
    assert error_of(response)["code"] == "auth_unavailable"


def test_with_keys_cached_signing_in_survives_a_supabase_outage(env: Env) -> None:
    assert env.get(make_token(env.key)).status_code == 200

    env.supabase.failing = True
    env.clock.advance(3600)

    assert env.get(make_token(env.key)).status_code == 200


# --- Wiring -----------------------------------------------------------------------------------


def test_one_key_cache_is_shared_for_a_project_and_not_across_projects() -> None:
    _cache_for.cache_clear()
    try:
        here = Settings(_env_file=None, supabase_url="http://127.0.0.1:54321")
        there = Settings(_env_file=None, supabase_url="https://abc.supabase.co")

        assert get_jwks_cache(here) is get_jwks_cache(here)
        assert get_jwks_cache(here) is not get_jwks_cache(there)
    finally:
        _cache_for.cache_clear()


# TODO(victor): add a test that a token whose `nbf` ("not before") is an hour in the future is
# rejected as invalid_token. PyJWT already checks it, so the code needs no change.
# Hint: copy test_an_anonymous_sign_in_is_refused_with_403, pass nbf=int(time.time()) + 3600 to
# make_token, and expect 401 with the code "invalid_token".
