from fastapi import APIRouter

router = APIRouter(prefix="/neon", tags=["neon"])


@router.get("/")
def get_neon():
    return {"provider": "neon"}


@router.post("/connect")
def connect_neon():
    return {"connected": True}
