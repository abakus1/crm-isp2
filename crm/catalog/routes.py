from __future__ import annotations

from typing import List

from fastapi import APIRouter

from crm.catalog.api.catalog_routes import router as catalog_router


def get_routers() -> List[APIRouter]:
    return [catalog_router]
