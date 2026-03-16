from fastapi import APIRouter

router1 = APIRouter(prefix="/v1")
router2 = APIRouter(prefix="/v2")


@router1.get("/items")
def list_v1_items():
    return []


@router2.get("/items")
def list_v2_items():
    return []
