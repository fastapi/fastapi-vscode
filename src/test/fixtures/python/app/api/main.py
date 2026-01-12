from fastapi import APIRouter
from app.api.routes import users, items, integrations

api_router = APIRouter()

api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(items.router, prefix="/items", tags=["items"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["integrations"])
