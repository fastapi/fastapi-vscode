from fastapi import FastAPI
from routers import admin_router

app = FastAPI()
app.include_router(admin_router)
