# crm/policies/rbac/roles.py
from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    ADMIN = "admin"
    STAFF = "staff"
