"""Stand-ins for the clock and for Supabase's key endpoint."""

from typing import Any

import httpx

from tests.keys import TestKey, jwks


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


class FakeSupabase:
    """Stands in for the key endpoint, and counts how often it's called."""

    def __init__(self, *keys: TestKey) -> None:
        self.document: Any = jwks(*keys)
        self.calls = 0
        self.failing = False

    def __call__(self) -> dict[str, Any]:
        self.calls += 1
        if self.failing:
            raise httpx.ConnectError("Supabase is down")
        return self.document
