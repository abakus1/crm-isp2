from __future__ import annotations

from typing import List

from fastapi import APIRouter

from crm.contracts.api.contracts_routes import router as contracts_router


def get_routers() -> List[APIRouter]:
    return [contracts_router]
