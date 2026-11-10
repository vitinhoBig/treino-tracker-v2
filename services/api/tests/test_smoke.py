"""The app boots, and its public surface is what we expect."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_the_openapi_schema_builds() -> None:
    # Building it walks every route and response model, so a broken one fails here, not in /docs.
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert "/health" in response.json()["paths"]


def test_protected_routes_document_their_auth_errors_and_public_ones_do_not() -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {"401", "403", "503"} <= set(paths["/v1/me"]["get"]["responses"])
    assert "401" not in paths["/health"]["get"]["responses"]
