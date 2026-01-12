from fastapi import APIRouter

router = APIRouter(tags=["integrations"])


@router.get("/neon/status")
def neon_status():
    return {"status": "ok"}


@router.post("/redis/connect")
def redis_connect():
    return {"connected": True}


@router.get("/supabase/health")
def supabase_health():
    return {"healthy": True}
