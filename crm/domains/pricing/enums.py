from __future__ import annotations

from enum import StrEnum


class PriceScheduleSource(StrEnum):
    CATALOG = "catalog"
    CONTRACT_POST_TERM = "contract_post_term"
    CONTRACT_ANNUAL = "contract_annual"
    MANUAL = "manual"
