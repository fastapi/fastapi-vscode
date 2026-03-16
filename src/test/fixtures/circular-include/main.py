from fastapi import FastAPI

from .other import router

app = FastAPI()

app.include_router(router)


@app.get("/")
def root():
    return {"ok": True}
