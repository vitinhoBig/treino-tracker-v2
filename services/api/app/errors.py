"""One error shape for every failure, so clients only have to handle a single format.

    {"error": {"code": "not_found", "message": "Not Found", "details": [...]}}

`code` is stable and meant for programs to branch on. `message` is for people and may change.
`details` appears only when there is more to say, such as which fields failed validation.
"""

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
    429: "too_many_requests",
}


class ErrorDetail(BaseModel):
    field: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(BaseModel):
    """The error shape as OpenAPI documents it. Responses are built by error_response() below."""

    error: ErrorBody


class ApiError(Exception):
    """Raise this from a route or dependency to return a specific error to the client."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        details: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    details: list[dict[str, Any]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return JSONResponse(status_code=status_code, content={"error": error}, headers=headers)


async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(
        exc.status_code, exc.code, exc.message, details=exc.details, headers=exc.headers
    )


async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Covers errors FastAPI raises itself, such as unknown routes (404) and wrong methods (405)."""
    code = _CODES.get(exc.status_code, f"http_{exc.status_code}")
    if isinstance(exc.detail, str):
        message = exc.detail
    else:
        try:
            message = HTTPStatus(exc.status_code).phrase
        except ValueError:
            message = "Error"
    # Keep headers such as Allow on a 405 or WWW-Authenticate on a 401.
    return error_response(exc.status_code, code, message, headers=exc.headers)


async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Only the location and message are returned. Pydantic's own error also holds the rejected
    # input, which may be a password or a token, and must never be echoed back.
    details = [
        {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
        for error in exc.errors()
    ]
    return error_response(422, "validation_error", "The request is invalid.", details=details)


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    # The traceback goes to the server log only. Clients get a fixed message, because exception
    # text can contain SQL, file paths or secrets.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return error_response(500, "internal_error", "Something went wrong on our side.")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _handle_api_error)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(RequestValidationError, _handle_validation_error)
    app.add_exception_handler(Exception, _handle_unexpected)
