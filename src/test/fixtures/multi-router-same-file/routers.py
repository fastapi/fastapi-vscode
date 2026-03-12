from fastapi import APIRouter

router1 = APIRouter(prefix="/v1")
router2 = APIRouter(prefix="/v2")


@router1.post("/path1")
def route11() -> str:
    return "v1"


@router1.post("/path2")
def route12() -> str:
    return "v1"


@router2.post("/path1")
def route21() -> str:
    return "v2"


@router2.post("/path2")
def route22() -> str:
    return "v2"
