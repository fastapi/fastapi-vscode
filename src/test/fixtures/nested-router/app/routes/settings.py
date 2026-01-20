from fastapi import APIRouter

router = APIRouter(prefix="/{app_id}/settings", tags=["settings"])


@router.get("/")
def get_settings(app_id: int):
    return {}


@router.put("/")
def update_settings(app_id: int):
    return {}
