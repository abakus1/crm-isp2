# crm/db/models/prg.py
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base
from crm.db.types.pg_point import PGPoint


class PrgDatasetState(Base):
    __tablename__ = "prg_dataset_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    dataset_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dataset_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_import_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_delta_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_reconcile_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PrgAddressPoint(Base):
    __tablename__ = "prg_address_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # źródło prawdy
    source: Mapped[str] = mapped_column(String(32), nullable=False)  # PRG_OFFICIAL | PRG_LOCAL_PENDING

    # identyfikatory
    prg_point_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    local_point_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)

    terc: Mapped[str] = mapped_column(String(8), nullable=False)
    simc: Mapped[str] = mapped_column(String(8), nullable=False)
    ulic: Mapped[str | None] = mapped_column(String(8), nullable=True)
    no_street: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    building_no: Mapped[str] = mapped_column(String(32), nullable=False)
    building_no_norm: Mapped[str] = mapped_column(String(32), nullable=False)
    local_no: Mapped[str | None] = mapped_column(String(32), nullable=True)
    local_no_norm: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Postgres POINT: (x,y) = (lon,lat)
    point: Mapped[tuple[float, float]] = mapped_column(PGPoint(), nullable=False)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'active'"))
    merged_into_id: Mapped[int | None] = mapped_column(
        ForeignKey(f"{Base.metadata.schema}.prg_address_points.id"),
        nullable=True,
    )

    # IMPORTANT: no union inside string forward-ref (SQLAlchemy evals this)
    merged_into: Mapped["PrgAddressPoint"] = relationship("PrgAddressPoint", remote_side=[id])

    # reconcile metadata
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_staff_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_by_job: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PrgReconcileQueue(Base):
    __tablename__ = "prg_reconcile_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    local_point_id: Mapped[int] = mapped_column(
        ForeignKey(f"{Base.metadata.schema}.prg_address_points.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'pending'"))  # pending|resolved|rejected
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_staff_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())