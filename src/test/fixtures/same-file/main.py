from fastapi import APIRouter, FastAPI

app = FastAPI(title="Same File Layout")

router = APIRouter(prefix="/api")


@router.get("/items")
def get_items():
    return {"items": []}


@router.post("/items")
def create_item():
    return {"item": "created"}


app.include_router(router)


@app.get("/")
def root():
    return {"message": "Hello from same file layout"}


@app.get("/health")
def health():
    return {"status": "ok"}
