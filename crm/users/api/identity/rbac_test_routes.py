from fastapi import APIRouter, Depends

from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

router = APIRouter(prefix="/rbac", tags=["rbac"])

@router.get("/admin-ping")
def admin_ping(_user=Depends(require(Action.AUDIT_READ_ALL))):
    return {"status": "ok", "admin_only": True}