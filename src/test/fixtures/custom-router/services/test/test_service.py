from auth.testing_router import ProtectedRouter

router = ProtectedRouter()


@router.get("/items")
def list_items():
    return []
