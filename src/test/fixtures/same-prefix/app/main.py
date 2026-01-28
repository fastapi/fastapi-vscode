from fastapi import FastAPI

from .login import router as login_router
from .utils import router as utils_router

app = FastAPI()

# Both routers included with the same prefix - should be merged
app.include_router(login_router, prefix="/api/v1")
app.include_router(utils_router, prefix="/api/v1")
