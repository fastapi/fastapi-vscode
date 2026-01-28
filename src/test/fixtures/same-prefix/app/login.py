from fastapi import APIRouter

router = APIRouter(tags=["login"])


@router.post("/login")
def login():
    return {"status": "ok"}
