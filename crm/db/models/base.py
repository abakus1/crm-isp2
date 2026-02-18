# crm/db/models/base.py
from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from crm.app.config import get_settings

settings = get_settings()

metadata = MetaData(schema=settings.db_schema)


class Base(DeclarativeBase):
    metadata = metadata
