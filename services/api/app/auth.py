"""Checks the Supabase access token on a request and says who is calling.

Verifying the token tells this API who the caller is and rejects bad tokens early. It is not the
access control for health data. That is Row Level Security: the API forwards the same token to
Supabase, which verifies it again, so a mistake here can't widen anyone's data access.

A token is accepted only if all of this holds:
- its algorithm is one of ALLOWED_ALGORITHMS, which are all asymmetric. The token doesn't get to
  pick: "none" and shared-secret algorithms such as HS256 are refused before any key is looked up.
- it names a key (`kid`) that Supabase publishes, and that key's own algorithm matches the token's
- the signature verifies, and `exp`, `iss`, `aud` and `sub` are present and correct
- it belongs to a signed-in account, not an anonymous sign-in
"""

import logging
from dataclasses import dataclass, field
from functools import lru_cache, partial
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import ApiError, ErrorResponse
from app.jwks import JwksCache, JwksUnavailableError, fetch_jwks_over_http
from app.settings import Settings, get_settings

logger = logging.getLogger(__name__)

ALLOWED_ALGORITHMS = ["ES256", "RS256", "EdDSA"]
AUDIENCE = "authenticated"
REQUIRED_CLAIMS = ["exp", "iss", "aud", "sub"]

# Add `responses=AUTH_RESPONSES` to a router or route that uses CurrentUser, so the OpenAPI docs
# list the errors a caller can get. FastAPI can't infer them: they're raised inside the dependency.
AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {
        "model": ErrorResponse,
        "description": "Missing, invalid or expired token: `missing_token`, `invalid_token` or "
        "`token_expired`. Refresh the session on `token_expired`, and sign in again otherwise.",
    },
    403: {
        "model": ErrorResponse,
        "description": "The token belongs to an anonymous sign-in: `anonymous_user`.",
    },
    503: {
        "model": ErrorResponse,
        "description": "Supabase's signing keys are unreachable: `auth_unavailable`. Retry soon.",
    },
}

bearer_scheme = HTTPBearer(auto_error=False, description="A Supabase access token")


@dataclass(frozen=True)
class AuthenticatedUser:
    id: UUID
    # Forwarded to Supabase so Row Level Security applies to what this API reads for the user. Left
    # out of repr() so it can't end up in a log line by accident.
    token: str = field(repr=False)


def _unauthorized(code: str, message: str, www_authenticate: str = "Bearer") -> ApiError:
    return ApiError(401, code, message, headers={"WWW-Authenticate": www_authenticate})


def _invalid_token(reason: str) -> ApiError:
    # The client only learns that the token is invalid. The reason goes to the log, never the token.
    logger.info("Rejected access token: %s", reason)
    return _unauthorized(
        "invalid_token", "The access token is invalid.", 'Bearer error="invalid_token"'
    )


def verify_token(
    token: str, *, cache: JwksCache, issuer: str, leeway_seconds: int
) -> AuthenticatedUser:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise _invalid_token("not a JWT") from None

    algorithm = header.get("alg")
    if algorithm not in ALLOWED_ALGORITHMS:
        raise _invalid_token("algorithm not allowed")
    kid = header.get("kid")
    if not isinstance(kid, str):
        raise _invalid_token("no key id")

    try:
        key = cache.get_key(kid)
    except JwksUnavailableError:
        raise ApiError(
            503, "auth_unavailable", "Could not verify credentials right now. Try again shortly."
        ) from None
    if key is None:
        raise _invalid_token("unknown key id")
    if key.algorithm_name != algorithm:
        raise _invalid_token("token algorithm differs from the key's")

    try:
        claims = jwt.decode(
            token,
            key.key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=AUDIENCE,
            issuer=issuer,
            leeway=leeway_seconds,
            options={"require": REQUIRED_CLAIMS},
        )
    except jwt.ExpiredSignatureError:
        logger.info("Rejected access token: expired")
        raise _unauthorized(
            "token_expired",
            "The access token has expired.",
            'Bearer error="invalid_token", error_description="The access token expired"',
        ) from None
    except jwt.PyJWTError as error:
        raise _invalid_token(type(error).__name__) from None

    if claims.get("role") != "authenticated":
        raise _invalid_token("role is not authenticated")
    try:
        user_id = UUID(str(claims["sub"]))
    except ValueError:
        raise _invalid_token("subject is not a user id") from None
    if claims.get("is_anonymous") is True:
        logger.info("Rejected access token: anonymous user")
        raise ApiError(403, "anonymous_user", "Anonymous sign-ins are not supported.")

    return AuthenticatedUser(id=user_id, token=token)


@lru_cache
def _cache_for(jwks_url: str, ttl_seconds: int, min_refresh_seconds: int) -> JwksCache:
    return JwksCache(
        partial(fetch_jwks_over_http, jwks_url),
        ttl_seconds=ttl_seconds,
        min_refresh_seconds=min_refresh_seconds,
    )


def get_jwks_cache(settings: Annotated[Settings, Depends(get_settings)]) -> JwksCache:
    """One cache per process, shared by every request. Tests replace this dependency."""
    return _cache_for(
        settings.jwks_url, settings.jwks_cache_seconds, settings.jwks_min_refresh_seconds
    )


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    settings: Annotated[Settings, Depends(get_settings)],
    cache: Annotated[JwksCache, Depends(get_jwks_cache)],
) -> AuthenticatedUser:
    """Use as `user: CurrentUser` in a route to require a valid sign-in."""
    if credentials is None:
        raise _unauthorized("missing_token", "Authentication required.")
    return verify_token(
        credentials.credentials,
        cache=cache,
        issuer=settings.auth_issuer,
        leeway_seconds=settings.jwt_leeway_seconds,
    )


CurrentUser = Annotated[AuthenticatedUser, Depends(current_user)]
