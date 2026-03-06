from fastapi import FastAPI
from routers import router


def get_fastapi_app() -> FastAPI:
    return FastAPI()


def create_app() -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/users")
    return app
