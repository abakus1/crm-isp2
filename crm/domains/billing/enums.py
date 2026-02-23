from __future__ import annotations

from enum import StrEnum


class PaymentPlanItemType(StrEnum):
    RECURRING_MONTHLY = "recurring_monthly"
    ACTIVATION_FEE = "activation_fee"
    PRORATA = "prorata"
    ADJUSTMENT = "adjustment"
    DISCOUNT = "discount"


class PaymentPlanItemStatus(StrEnum):
    PLANNED = "planned"
    INVOICED = "invoiced"
    CANCELLED = "cancelled"
