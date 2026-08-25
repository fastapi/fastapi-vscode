from fastapi import FastAPI
from services.test import test_service

app = FastAPI()
app.include_router(test_service.router)
