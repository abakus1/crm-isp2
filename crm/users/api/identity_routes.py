
from fastapi import APIRouter

router = APIRouter(prefix="/identity", tags=["Identity"])

@router.get("/health")
def identity_health():
    return {"status": "identity ok"}
