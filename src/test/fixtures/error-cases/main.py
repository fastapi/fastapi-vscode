from fastapi import FastAPI

from .other import router
from .nonexistent import missing_router

app = FastAPI()

app.include_router(router)
app.include_router(missing_router)


@app.get("/")
def root():
    return {"ok": True}
