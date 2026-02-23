# crm/db/models/contracts.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Identity, Integer, String, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


# NOTE:
#  - Postgres ENUM types are created by Alembic migrations.
#  - We bind to existing types with create_type=False.
ContractStatusDb = ENUM(
    "inactive",
    "active",
    "suspended",
    "blocked",
    "to_terminate",
    "debt_collection",
    "archived",
    name="contract_status",
    schema=SCHEMA,
    create_type=False,
)


class Contract(Base):
    __tablename__ = "contracts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subscriber_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    contract_no: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(ContractStatusDb, nullable=False, server_default=text("'inactive'"))

    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    service_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    service_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_indefinite: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    term_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notice_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    billing_day: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    versions: Mapped[list["ContractVersion"]] = relationship(
        back_populates="contract",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ContractVersion.version_no",
    )


class ContractVersion(Base):
    __tablename__ = "contract_versions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    contract_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    created_by_staff_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    contract: Mapped[Contract] = relationship(back_populates="versions")
