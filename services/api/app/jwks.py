"""Fetches, caches and refreshes the public keys that verify Supabase tokens.

Why not PyJWT's own PyJWKClient: when a token names a key it doesn't know, that client refetches
on every such request. Anyone can send tokens with made-up key ids, so each one would make this API
call Supabase. This cache refetches at most once per `min_refresh_seconds` instead.
"""

import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import httpx
import jwt
from jwt import PyJWK

logger = logging.getLogger(__name__)

# Only keys that verify (public keys). A shared-secret ("oct") key in the list is ignored, so the
# published keys can never be used to accept a token signed with a secret.
_ASYMMETRIC_KEY_TYPES = {"EC", "RSA", "OKP"}

Fetch = Callable[[], dict[str, Any]]


class JwksUnavailableError(Exception):
    """No usable keys are cached, and they can't be fetched right now."""


def fetch_jwks_over_http(url: str, timeout_seconds: float = 5.0) -> dict[str, Any]:
    response = httpx.get(url, timeout=timeout_seconds)
    response.raise_for_status()
    return response.json()


def _parse_keys(document: Any) -> dict[str, PyJWK]:
    """Turns a JWKS document into {kid: key}, skipping anything that isn't a usable public key."""
    if not isinstance(document, dict) or not isinstance(document.get("keys"), list):
        raise ValueError("not a JWKS document")
    keys: dict[str, PyJWK] = {}
    for entry in document["keys"]:
        if not isinstance(entry, dict):
            continue
        kid = entry.get("kid")
        if not isinstance(kid, str) or entry.get("kty") not in _ASYMMETRIC_KEY_TYPES:
            continue
        try:
            keys[kid] = PyJWK(entry)
        except (jwt.PyJWTError, ValueError, KeyError, TypeError) as error:
            # One malformed key must not cost us the good ones.
            logger.warning("Skipping signing key %s: %s", kid, type(error).__name__)
    if not keys:
        raise ValueError("the JWKS document has no usable keys")
    return keys


class JwksCache:
    def __init__(
        self,
        fetch: Fetch,
        *,
        ttl_seconds: float = 600,
        min_refresh_seconds: float = 30,
        max_stale_seconds: float = 86_400,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._fetch = fetch
        self._ttl = ttl_seconds
        self._min_refresh = min_refresh_seconds
        self._max_stale = max_stale_seconds
        self._clock = clock
        # One lock around everything: when many requests arrive at once with a cold cache, one
        # fetches and the rest wait for its answer, instead of all calling Supabase.
        self._lock = threading.Lock()
        self._keys: dict[str, PyJWK] = {}
        self._fetched_at: float | None = None
        self._last_attempt: float | None = None

    def get_key(self, kid: str) -> PyJWK | None:
        """The key with this id, or None if there is no such key.

        Raises JwksUnavailableError if no keys are cached and none can be fetched.
        """
        with self._lock:
            now = self._clock()
            expired = self._fetched_at is None or now - self._fetched_at >= self._ttl
            if expired and self._may_refresh(now):
                self._refresh(now)
            key = self._keys.get(kid)
            if key is None and self._may_refresh(now):
                # A key we haven't seen: Supabase may have rotated. After a refresh just above,
                # this is skipped, because the attempt was this very moment.
                self._refresh(now)
                key = self._keys.get(kid)
            if self._fetched_at is not None and now - self._fetched_at > self._max_stale:
                # Don't trust keys indefinitely during an outage: one could have been revoked.
                self._keys = {}
            if not self._keys:
                raise JwksUnavailableError("no signing keys are available")
            return key

    def _may_refresh(self, now: float) -> bool:
        return self._last_attempt is None or now - self._last_attempt >= self._min_refresh

    def _refresh(self, now: float) -> None:
        # Failed attempts count too, so a Supabase outage isn't answered with a fetch per request.
        self._last_attempt = now
        try:
            keys = _parse_keys(self._fetch())
        except Exception as error:  # Any failure leaves the previous keys in place.
            logger.warning("Could not refresh signing keys: %s", type(error).__name__)
            return
        self._keys = keys
        self._fetched_at = now
