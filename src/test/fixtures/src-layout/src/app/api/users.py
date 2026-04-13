from fastapi import APIRouter

router = APIRouter()


@router.get("/")
async def list_users():
    return []


@router.post("/")
async def create_user():
    return {}
