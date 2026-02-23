from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CatalogProductOut(BaseModel):
    id: int
    code: str
    type: str
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CatalogRequirementOut(BaseModel):
    id: int
    primary_product_id: int
    required_product_id: int
    min_qty: int
    max_qty: Optional[int] = None
    is_hard_required: bool
    created_at: datetime
    updated_at: datetime

    # helper fields for UI convenience (join)
    primary_product_code: Optional[str] = None
    required_product_code: Optional[str] = None


class CatalogRequirementCreateIn(BaseModel):
    primary_product_id: int
    required_product_id: int
    min_qty: int = Field(default=1, ge=0)
    max_qty: Optional[int] = Field(default=None, ge=0)
    is_hard_required: bool = True


class CatalogRequirementUpdateIn(BaseModel):
    min_qty: int = Field(default=1, ge=0)
    max_qty: Optional[int] = Field(default=None, ge=0)
    is_hard_required: bool = True
