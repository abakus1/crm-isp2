from __future__ import annotations

from typing import List

from fastapi import APIRouter

from crm.sms.api.sms_routes import router as sms_router


def get_routers() -> List[APIRouter]:
    return [sms_router]
