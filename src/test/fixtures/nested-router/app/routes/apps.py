from fastapi import APIRouter

from .tokens import router as tokens_router
from .settings import router as settings_router

router = APIRouter(prefix="/apps", tags=["apps"])


@router.get("/")
def list_apps():
    return []


@router.get("/{app_id}")
def get_app(app_id: int):
    return {"id": app_id}


# Nested routers - apps router includes tokens and settings routers
router.include_router(tokens_router, tags=["tokens"])
router.include_router(settings_router)
