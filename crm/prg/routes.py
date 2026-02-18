from __future__ import annotations

from typing import List

from fastapi import APIRouter

from crm.prg.api.prg_routes import router as prg_router


def get_routers() -> List[APIRouter]:
    return [prg_router]
