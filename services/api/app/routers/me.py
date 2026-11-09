"""Who is calling. The smallest protected route, and the pattern every later one follows."""

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth import CurrentUser

router = APIRouter(prefix="/v1")


class Me(BaseModel):
    id: UUID


@router.get("/me")
def me(user: CurrentUser) -> Me:
    # Straight from the verified token's `sub` claim. No database call: the token already says
    # who the caller is, and profile data arrives with the profile feature.
    return Me(id=user.id)
