from fastapi import FastAPI

import subapp

app = FastAPI()
app.mount("/mounted", subapp.app)
