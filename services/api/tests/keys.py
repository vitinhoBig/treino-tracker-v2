"""Signing keys and tokens for tests. Generated fresh, so no real key is ever stored in the repo."""

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
