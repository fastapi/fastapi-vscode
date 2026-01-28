from fastapi import APIRouter

from .main import app  # circular import back to main

router = APIRouter(prefix="/other")


@router.get("/")
def other():
    return {"other": True}
