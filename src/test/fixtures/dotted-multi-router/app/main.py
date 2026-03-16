from fastapi import FastAPI

from .routes_pkg import api_v

app = FastAPI()
app.include_router(api_v.router1)
app.include_router(api_v.router2)
