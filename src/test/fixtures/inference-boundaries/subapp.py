from fastapi import FastAPI


def create_app():
    return FastAPI()


app = create_app()
not_router = object()
