from auth.testing_router import ProtectedRouter

router = ProtectedRouter(prefix="/service", tags=["service"])


@router.get("/items")
def list_items():
    return []
