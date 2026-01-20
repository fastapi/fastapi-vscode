from fastapi import APIRouter

router = APIRouter(prefix="/{app_id}/tokens", tags=["tokens"])


@router.get("/")
def list_tokens(app_id: int):
    return []


@router.post("/")
def create_token(app_id: int):
    return {"id": 1}
