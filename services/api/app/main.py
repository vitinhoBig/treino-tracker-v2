"""FastAPI entry point. Routers hold the HTTP layer; later phases add services and analytics."""

from fastapi import FastAPI

from app.routers import health, hello

app = FastAPI(title="treino-tracker API", version="0.1.0")
app.include_router(health.router)
app.include_router(hello.router)
