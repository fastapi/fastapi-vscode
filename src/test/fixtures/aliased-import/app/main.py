from fastapi import FastAPI

from .routes.tokens import router as tokens_router

app = FastAPI(title="Aliased Import Test")

app.include_router(tokens_router)


@app.get("/")
def root():
    return {"message": "Hello"}
