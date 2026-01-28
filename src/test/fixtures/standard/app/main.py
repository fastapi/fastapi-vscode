from fastapi import FastAPI

from .routes import items, users

app = FastAPI(title="Standard Package Layout")

app.include_router(users.router, tags=["user-management"])
app.include_router(items.router)


@app.get("/")
def root():
    return {"message": "Hello from standard package layout"}


@app.get("/health")
def health():
    return {"status": "ok"}
