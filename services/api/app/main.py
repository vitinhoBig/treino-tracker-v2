"""FastAPI entry point. Routers hold the HTTP layer; later phases add services and analytics."""

from fastapi import FastAPI

from app.errors import register_error_handlers
from app.routers import health, hello, me


def create_app() -> FastAPI:
    """Builds the app. A function, so tests can build their own copy and add routes to it."""
    app = FastAPI(title="treino-tracker API", version="0.1.0")
    register_error_handlers(app)
    app.include_router(health.router)
    app.include_router(hello.router)
    app.include_router(me.router)
    return app


app = create_app()
