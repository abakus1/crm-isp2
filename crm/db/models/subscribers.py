from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


class Subscriber(Base):
    """Minimal ORM mapping for crm.subscribers.

    This project already has the subscribers table from historical migrations,
    but the ORM model was missing from metadata. SQLAlchemy then couldn't
    resolve FKs like sms_outbound_messages.subscriber_id during flush.

    Keep this mapping intentionally small and aligned with the original MVP
    migration until the full subscriber model is reintroduced here.
    """

    __tablename__ = "subscribers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    operational_status: Mapped[str] = mapped_column(Text, nullable=False)
    accounting_status: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
