from fastapi import APIRouter

from .main import app  # circular import back to main

router = APIRouter(prefix="/other")

# This actually exercises the cycle through include_router
router.include_router(app)


@router.get("/")
def other():
    return {"other": True}
