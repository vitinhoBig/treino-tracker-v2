"""Liveness check. Hosts and monitors call this, so it stays public and does no real work."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
