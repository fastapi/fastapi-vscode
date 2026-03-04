from fastapi import FastAPI as FA
from fastapi import APIRouter as AR

app = FA()
router = AR(prefix="/users")


@router.get("/")
def list_users():
    return []


@router.post("/")
def create_user():
    return {}


app.include_router(router)
