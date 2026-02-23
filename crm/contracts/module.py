from fastapi import FastAPI

from crm.contracts.routes import get_routers


def register(app: FastAPI) -> None:
    for r in get_routers():
        app.include_router(r)
