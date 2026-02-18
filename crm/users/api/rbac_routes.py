
from fastapi import APIRouter

router = APIRouter(prefix="/rbac", tags=["RBAC"])

@router.get("/health")
def rbac_health():
    return {"status": "rbac ok"}
