from fastapi import APIRouter

router = APIRouter(prefix="/tokens", tags=["tokens"])


@router.get("/")
def list_tokens():
    return []


@router.post("/")
def create_token():
    return {"id": 1}


@router.delete("/{token_id}")
def delete_token(token_id: int):
    return {"deleted": token_id}
