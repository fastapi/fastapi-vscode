from fastapi import FastAPI

from app.api import api_router

app = FastAPI()


@app.get("/")
async def root():
    return {"message": "Hello"}


app.include_router(api_router)
