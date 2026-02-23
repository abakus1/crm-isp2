from __future__ import annotations

from enum import StrEnum


class SubscriptionType(StrEnum):
    INTERNET = "internet"
    TV = "tv"
    VOIP = "voip"
    ADDON = "addon"


class SubscriptionStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BLOCKED = "blocked"
    TERMINATED = "terminated"
    ARCHIVED = "archived"


class SubscriptionChangeType(StrEnum):
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"
    TERMINATE = "terminate"
    SUSPEND = "suspend"
    RESUME = "resume"


class SubscriptionChangeStatus(StrEnum):
    PENDING = "pending"
    APPLIED = "applied"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
