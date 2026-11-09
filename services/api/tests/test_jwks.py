"""The signing-key cache: when it fetches, and what it does when Supabase is down."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
import pytest

from app.jwks import JwksCache, JwksUnavailableError, fetch_jwks_over_http
from tests.fakes import FakeClock, FakeSupabase
from tests.keys import TestKey, jwks


def make_cache(supabase: FakeSupabase, clock: FakeClock, **options: float) -> JwksCache:
    return JwksCache(supabase, ttl_seconds=600, min_refresh_seconds=30, clock=clock, **options)


def test_a_known_key_is_returned_and_cached() -> None:
    key = TestKey("key-1")
    supabase, clock = FakeSupabase(key), FakeClock()
    cache = make_cache(supabase, clock)

    assert cache.get_key("key-1") is not None
    assert cache.get_key("key-1") is not None
    assert supabase.calls == 1


def test_keys_are_refetched_after_the_ttl() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)
    cache.get_key("key-1")

    clock.advance(599)
    cache.get_key("key-1")
    assert supabase.calls == 1

    clock.advance(2)
    cache.get_key("key-1")
    assert supabase.calls == 2


def test_an_unknown_key_returns_none_rather_than_an_error() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)

    assert cache.get_key("never-heard-of-it") is None


def test_a_rotated_in_key_is_found_after_the_refresh_gap() -> None:
    old, new = TestKey("old"), TestKey("new")
    supabase, clock = FakeSupabase(old), FakeClock()
    cache = make_cache(supabase, clock)
    cache.get_key("old")

    supabase.document = jwks(old, new)
    clock.advance(31)

    assert cache.get_key("new") is not None
    assert supabase.calls == 2


def test_made_up_key_ids_cannot_make_the_api_hammer_supabase() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)

    for number in range(200):
        assert cache.get_key(f"made-up-{number}") is None
    assert supabase.calls == 1

    clock.advance(31)
    for number in range(200):
        cache.get_key(f"more-made-up-{number}")
    assert supabase.calls == 2


def test_an_unknown_key_right_after_a_ttl_refresh_does_not_fetch_twice() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)
    cache.get_key("key-1")

    clock.advance(700)
    cache.get_key("made-up")

    assert supabase.calls == 2


def test_with_no_keys_cached_a_failed_fetch_is_an_error() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    supabase.failing = True
    cache = make_cache(supabase, clock)

    with pytest.raises(JwksUnavailableError):
        cache.get_key("key-1")


def test_failed_fetches_are_not_retried_on_every_request() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    supabase.failing = True
    cache = make_cache(supabase, clock)

    for _ in range(50):
        with pytest.raises(JwksUnavailableError):
            cache.get_key("key-1")
    assert supabase.calls == 1

    clock.advance(31)
    supabase.failing = False
    assert cache.get_key("key-1") is not None


def test_cached_keys_keep_working_while_supabase_is_down() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)
    cache.get_key("key-1")

    supabase.failing = True
    clock.advance(3600)

    assert cache.get_key("key-1") is not None


def test_cached_keys_are_dropped_after_being_stale_too_long() -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock, max_stale_seconds=3600)
    cache.get_key("key-1")

    supabase.failing = True
    clock.advance(3601)

    with pytest.raises(JwksUnavailableError):
        cache.get_key("key-1")


@pytest.mark.parametrize(
    "garbage", [{}, {"keys": []}, {"keys": "nope"}, ["not", "a", "dict"], None]
)
def test_a_garbage_response_does_not_replace_good_keys(garbage: Any) -> None:
    supabase, clock = FakeSupabase(TestKey("key-1")), FakeClock()
    cache = make_cache(supabase, clock)
    cache.get_key("key-1")

    supabase.document = garbage
    clock.advance(700)

    assert cache.get_key("key-1") is not None


def test_a_garbage_response_with_nothing_cached_is_an_error() -> None:
    supabase, clock = FakeSupabase(), FakeClock()
    supabase.document = {"keys": []}
    cache = make_cache(supabase, clock)

    with pytest.raises(JwksUnavailableError):
        cache.get_key("key-1")


def test_shared_secret_keys_in_the_list_are_ignored() -> None:
    good = TestKey("good")
    supabase, clock = FakeSupabase(good), FakeClock()
    supabase.document["keys"].append(
        {"kty": "oct", "kid": "secret", "k": "c2VjcmV0", "alg": "HS256"}
    )
    cache = make_cache(supabase, clock)

    assert cache.get_key("good") is not None
    assert cache.get_key("secret") is None


def test_keys_without_an_id_or_with_a_broken_shape_are_skipped() -> None:
    good = TestKey("good")
    supabase, clock = FakeSupabase(good), FakeClock()
    nameless = {k: v for k, v in TestKey("x").jwk.items() if k != "kid"}
    supabase.document["keys"] += [nameless, {"kty": "EC", "kid": "broken"}, "junk"]
    cache = make_cache(supabase, clock)

    assert cache.get_key("good") is not None
    assert cache.get_key("broken") is None


def test_many_simultaneous_requests_with_a_cold_cache_fetch_once() -> None:
    key = TestKey("key-1")
    calls = []

    def slow_fetch() -> dict[str, Any]:
        calls.append(threading.get_ident())
        time.sleep(0.05)
        return jwks(key)

    cache = JwksCache(slow_fetch, ttl_seconds=600, min_refresh_seconds=30)

    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(lambda _: cache.get_key("key-1"), range(20)))

    assert all(result is not None for result in results)
    assert len(calls) == 1


def test_fetching_over_http_returns_the_json(monkeypatch: pytest.MonkeyPatch) -> None:
    url = "http://example.test/auth/v1/.well-known/jwks.json"
    key = TestKey("key-1")

    def fake_get(requested: str, timeout: float) -> httpx.Response:
        assert requested == url
        assert timeout == 5.0
        return httpx.Response(200, json=jwks(key), request=httpx.Request("GET", requested))

    monkeypatch.setattr(httpx, "get", fake_get)

    assert fetch_jwks_over_http(url) == jwks(key)


def test_fetching_over_http_raises_on_an_error_status(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_get(requested: str, timeout: float) -> httpx.Response:
        return httpx.Response(503, request=httpx.Request("GET", requested))

    monkeypatch.setattr(httpx, "get", fake_get)

    with pytest.raises(httpx.HTTPStatusError):
        fetch_jwks_over_http("http://example.test/jwks.json")
