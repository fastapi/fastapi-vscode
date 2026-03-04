import fastapi as f

app = f.FastAPI()
router = f.APIRouter(prefix="/users")


@router.get("/")
def list_users():
    return []


@router.post("/")
def create_user():
    return {}


app.include_router(router)
