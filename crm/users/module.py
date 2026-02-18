
from fastapi import FastAPI
from crm.users.api.identity_routes import router as identity_router
from crm.users.api.staff_routes import router as staff_router
from crm.users.api.rbac_routes import router as rbac_router

def register(app: FastAPI):
    app.include_router(identity_router)
    app.include_router(staff_router)
    app.include_router(rbac_router)
