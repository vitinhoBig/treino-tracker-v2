"""Signing keys and tokens for tests. Generated fresh, so no real key is ever stored in the repo."""

import base64
import hashlib
import hmac
import json
import time
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric import ec


class TestKey:
    """An EC key pair. `jwk` is the public half, as Supabase would publish it."""

    __test__ = False  # Not a pytest test class, despite the name.

    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.jwk: dict[str, Any] = {
            **jwt.algorithms.ECAlgorithm.to_jwk(self.private_key.public_key(), as_dict=True),
            "kid": kid,
            "alg": "ES256",
            "use": "sig",
        }


def jwks(*keys: TestKey) -> dict[str, Any]:
    return {"keys": [key.jwk for key in keys]}


def make_token(
    key: TestKey,
    *,
    issuer: str = "http://127.0.0.1:54321/auth/v1",
    algorithm: str = "ES256",
    signing_key: Any = None,
    kid: str | None = "from-key",
    **claims: Any,
) -> str:
    """A signed token that passes every check by default. Override a claim to break it, or pass
    `claim=None` to leave that claim out."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "iss": issuer,
        "aud": "authenticated",
        "sub": "11111111-2222-4333-8444-555555555555",
        "role": "authenticated",
        "iat": now,
        "exp": now + 3600,
        **claims,
    }
    payload = {name: value for name, value in payload.items() if value is not None}
    headers: dict[str, Any] = {} if kid is None else {"kid": key.kid if kid == "from-key" else kid}
    return jwt.encode(payload, signing_key or key.private_key, algorithm=algorithm, headers=headers)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def forge(header: dict[str, Any], claims: dict[str, Any], secret: bytes | None = None) -> str:
    """Builds a token by hand, bypassing PyJWT's own refusals, to imitate an attacker.

    With a secret, it's signed with HMAC-SHA256. Without one, the signature is empty."""
    signing_input = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(claims).encode())}"
    if secret is None:
        return signing_input + "."
    signature = hmac.new(secret, signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64(signature)}"
