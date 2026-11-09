"""The error format: every failure has the same shape, and nothing sensitive leaks into it."""

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app.errors import ApiError
from app.main import create_app


class Person(BaseModel):
    age: int


def build_client() -> TestClient:
    """The real app plus a few routes whose only job is to fail in a specific way."""
    app = create_app()

    @app.get("/test/api-error")
    def api_error() -> None:
        raise ApiError(
            409,
            "name_taken",
            "That name is taken.",
            details=[{"field": "name", "message": "already in use"}],
            headers={"X-Test": "yes"},
        )

    @app.get("/test/http-exception")
    def http_exception(status: int) -> None:
        raise HTTPException(status_code=status, detail="Nope")

    @app.get("/test/http-exception-dict")
    def http_exception_dict() -> None:
        raise HTTPException(status_code=400, detail={"anything": "structured"})

    @app.get("/test/boom")
    def boom() -> None:
        raise RuntimeError("secret detail: the database password is hunter2")

    @app.post("/test/person")
    def person(body: Person) -> Person:
        return body

    # Unhandled exceptions are turned into a 500 response, so the client must not re-raise them.
    return TestClient(app, raise_server_exceptions=False)


client = build_client()


def error_of(response) -> dict:
    """Asserts the envelope has exactly one top-level key, and returns what's inside it."""
    body = response.json()
    assert list(body) == ["error"]
    assert response.headers["content-type"] == "application/json"
    return body["error"]


def test_unknown_route_is_a_404_in_the_standard_shape() -> None:
    response = client.get("/nope")

    assert response.status_code == 404
    assert error_of(response) == {"code": "not_found", "message": "Not Found"}


def test_wrong_method_is_a_405_and_keeps_the_allow_header() -> None:
    response = client.post("/health")

    assert response.status_code == 405
    assert error_of(response)["code"] == "method_not_allowed"
    assert "GET" in response.headers["allow"]


def test_validation_errors_name_the_field_and_the_location() -> None:
    response = client.post("/test/person", json={"age": "hunter2"})

    assert response.status_code == 422
    error = error_of(response)
    assert error["code"] == "validation_error"
    assert error["details"][0]["field"] == "body.age"
    assert error["details"][0]["message"]


def test_validation_errors_never_echo_what_the_client_sent() -> None:
    response = client.post("/test/person", json={"age": "hunter2"})

    assert "hunter2" not in response.text


def test_a_missing_query_parameter_is_a_validation_error() -> None:
    response = client.get("/test/http-exception")

    assert response.status_code == 422
    assert error_of(response)["details"][0]["field"] == "query.status"


def test_api_error_sets_status_code_message_details_and_headers() -> None:
    response = client.get("/test/api-error")

    assert response.status_code == 409
    assert error_of(response) == {
        "code": "name_taken",
        "message": "That name is taken.",
        "details": [{"field": "name", "message": "already in use"}],
    }
    assert response.headers["x-test"] == "yes"


def test_http_exceptions_get_a_code_for_their_status() -> None:
    for status, code in [(400, "bad_request"), (401, "unauthorized"), (403, "forbidden")]:
        response = client.get(f"/test/http-exception?status={status}")

        assert response.status_code == status
        assert error_of(response) == {"code": code, "message": "Nope"}


def test_a_status_without_a_code_falls_back_to_http_and_the_number() -> None:
    response = client.get("/test/http-exception?status=418")

    assert response.status_code == 418
    assert error_of(response)["code"] == "http_418"


def test_a_non_text_detail_becomes_the_standard_phrase() -> None:
    response = client.get("/test/http-exception-dict")

    assert response.status_code == 400
    assert error_of(response) == {"code": "bad_request", "message": "Bad Request"}


def test_unexpected_errors_are_a_500_that_reveals_nothing() -> None:
    response = client.get("/test/boom")

    assert response.status_code == 500
    assert error_of(response) == {
        "code": "internal_error",
        "message": "Something went wrong on our side.",
    }
    assert "hunter2" not in response.text
    assert "RuntimeError" not in response.text


def test_unexpected_errors_are_logged_with_their_traceback(caplog) -> None:
    client.get("/test/boom")

    assert any("hunter2" in str(record.exc_info) for record in caplog.records)
