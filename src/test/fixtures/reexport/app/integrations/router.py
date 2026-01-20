from fastapi import APIRouter

from .neon import router as neon_router

router = APIRouter(prefix="/integrations", tags=["integrations"])

# Nested router
router.include_router(neon_router)


@router.get("/github")
def github_integration():
    return {"provider": "github", "status": "connected"}


@router.get("/slack")
def slack_integration():
    return {"provider": "slack", "status": "connected"}


@router.post("/webhook")
def webhook():
    return {"received": True}
