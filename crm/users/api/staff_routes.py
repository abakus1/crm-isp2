
from fastapi import APIRouter

router = APIRouter(prefix="/staff", tags=["Staff"])

@router.get("/health")
def staff_health():
    return {"status": "staff ok"}
