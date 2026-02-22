from fastapi import APIRouter

from crm.users.api.identity.identity_routes import router as identity_router
from crm.users.api.identity.rbac_test_routes import router as rbac_test_router
from crm.users.api.staff.staff_routes import router as staff_router
from crm.users.api.rbac.rbac_routes import router as rbac_router
from crm.users.api.audit.activity_routes import router as activity_router

def get_routers() -> list[APIRouter]:
    return [
        identity_router,
        rbac_test_router,
        staff_router,
        rbac_router,
        activity_router,
    ]
