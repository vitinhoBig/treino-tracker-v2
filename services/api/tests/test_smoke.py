from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_hello_returns_message() -> None:
    response = client.get("/v1/hello")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, treino-tracker"}


def test_hello_greets_the_given_name() -> None:
    response = client.get("/v1/hello?name=Victor")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, Victor"}
