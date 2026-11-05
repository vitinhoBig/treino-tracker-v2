"""Hello-world route that proves the service runs. Remove it when the first real endpoint lands."""

from fastapi import APIRouter

router = APIRouter(prefix="/v1")


# TODO(victor): Accept an optional `name` query parameter and return "Hello, <name>".
# Hint: add `name: str = "treino-tracker"` to the function signature. FastAPI reads it from the
# query string. Then add a test that calls /v1/hello?name=Victor.
@router.get("/hello")
def hello() -> dict[str, str]:
    return {"message": "Hello from the treino-tracker API"}
