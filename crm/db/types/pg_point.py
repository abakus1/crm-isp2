# crm/db/types/pg_point.py
from __future__ import annotations

from sqlalchemy.types import UserDefinedType


class PGPoint(UserDefinedType):
    """PostgreSQL native POINT type.

    Stored as POINT (x,y) = (lon,lat).
    """
    cache_ok = True

    def get_col_spec(self, **kw) -> str:
        return "POINT"
