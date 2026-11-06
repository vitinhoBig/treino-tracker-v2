"""Hello-world route that proves the service runs. Remove it when the first real endpoint lands."""

from fastapi import APIRouter

router = APIRouter(prefix="/v1")


@router.get("/hello")
def hello(name: str = "treino-tracker") -> dict[str, str]:
    return {"message": f"Hello, {name}"}
