from fastapi import FastAPI

# Multiple FastAPI apps in the same file
public_app = FastAPI(title="Public API")
admin_app = FastAPI(title="Admin API")


@public_app.get("/")
def public_root():
    return {"message": "Public API"}


@public_app.get("/products")
def list_products():
    return {"products": []}


@admin_app.get("/")
def admin_root():
    return {"message": "Admin API"}


@admin_app.get("/users")
def list_users():
    return {"users": []}


@admin_app.delete("/users/{user_id}")
def delete_user(user_id: int):
    return {"deleted": user_id}
