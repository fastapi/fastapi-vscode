from fastapi import APIRouter


class AdminAPIRouter(APIRouter):
    pass


admin_router = AdminAPIRouter(prefix="/admin")


@admin_router.get("/users")
def list_users():
    return []


@admin_router.post("/users")
def create_user():
    return {}
