from app import get_fastapi_app

app = get_fastapi_app()


@app.get("/1")
def one():
    return "Route one"


@app.get("/2")
def two():
    return "Route two"
