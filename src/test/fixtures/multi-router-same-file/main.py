from fastapi import FastAPI
from .routers import router1, router2

app = FastAPI()
app.include_router(router1)
app.include_router(router2)