from fastapi import FastAPI

from .routes import apps

app = FastAPI(title="Nested Router Test")

# Use dotted reference like real codebase: apps.router
app.include_router(apps.router, prefix="/api")


@app.get("/")
def root():
    return {"message": "Hello"}
