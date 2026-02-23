from __future__ import annotations

from enum import StrEnum


class ContractStatus(StrEnum):
    INACTIVE = "inactive"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BLOCKED = "blocked"
    TO_TERMINATE = "to_terminate"
    DEBT_COLLECTION = "debt_collection"
    ARCHIVED = "archived"
