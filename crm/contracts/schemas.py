from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SubscriptionOut(BaseModel):
    id: int
    contract_id: int
    type: str
    status: str
    is_primary: bool
    parent_subscription_id: Optional[int] = None
    product_code: Optional[str] = None
    tariff_code: Optional[str] = None
    quantity: int
    billing_period_months: int
    service_address_id: Optional[int] = None
    provisioning: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class SubscriptionCreateIn(BaseModel):
    type: str = Field(..., description="internet|tv|voip|addon")
    product_code: Optional[str] = None
    tariff_code: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    billing_period_months: int = Field(default=1, ge=1)
    is_primary: Optional[bool] = None
    parent_subscription_id: Optional[int] = None
    service_address_id: Optional[int] = None
    provisioning: Optional[dict[str, Any]] = None


class SubscriptionUpdateIn(BaseModel):
    product_code: Optional[str] = None
    tariff_code: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    billing_period_months: int = Field(default=1, ge=1)
    is_primary: Optional[bool] = None
    parent_subscription_id: Optional[int] = None
    service_address_id: Optional[int] = None
    provisioning: Optional[dict[str, Any]] = None
