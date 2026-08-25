from fastapi import FastAPI

import subapp

app = FastAPI()
app.include_router(subapp.not_router)
app.mount("/mounted", subapp.app)
