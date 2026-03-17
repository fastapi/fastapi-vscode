from fastapi import APIRouter

router1 = APIRouter(prefix="/v1")
router2 = APIRouter(prefix="/v2")

@router1.get("/items")
def get_items_v1():
    pass

@router2.get("/items")
def get_items_v2():
    pass