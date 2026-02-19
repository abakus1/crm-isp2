# crm/db/models/prg.py
from __future__ import annotations

from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    text,
    BigInteger,
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

    # surowe współrzędne PRG (PUWG 1992 / EPSG:2180)
    x_1992: Mapped[int | None] = mapped_column(Integer, nullable=True)
    y_1992: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Postgres POINT: (x,y) = (lon,lat)
    point: Mapped[tuple[float, float]] = mapped_column(PGPoint(), nullable=False)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'active'"))
    merged_into_id: Mapped[int | None] = mapped_column(
        ForeignKey(f"{Base.metadata.schema}.prg_address_points.id"),
        nullable=True,
    )

    merged_into: Mapped["PrgAddressPoint"] = relationship("PrgAddressPoint", remote_side=[id])

    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_staff_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_by_job: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PrgAdruniBuildingNumber(Base):
    __tablename__ = "prg_adruni_building_numbers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    terc: Mapped[str] = mapped_column(String(8), nullable=False)
    simc: Mapped[str] = mapped_column(String(8), nullable=False)
    ulic: Mapped[str | None] = mapped_column(String(8), nullable=True)

    place_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    street_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    building_no: Mapped[str] = mapped_column(String(32), nullable=False)
    building_no_norm: Mapped[str] = mapped_column(String(32), nullable=False)

    # raw ADRUNI record (pipe-delimited etc.) – source of truth
    adruni: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PrgReconcileQueue(Base):
    __tablename__ = "prg_reconcile_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    local_point_id: Mapped[int] = mapped_column(
        ForeignKey(f"{Base.metadata.schema}.prg_address_points.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default=text("'pending'"))
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )

    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_by_staff_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PrgImportFile(Base):
    __tablename__ = "prg_import_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    filename: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    mode: Mapped[str] = mapped_column(String(16), nullable=False)  # full|delta
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'pending'"))

    checksum: Mapped[str] = mapped_column(String(128), nullable=False)

    rows_inserted: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    rows_updated: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# -------------------------
# PRG Jobs (live status)
# -------------------------
class PrgJob(Base):
    __tablename__ = "prg_jobs"

    id: Mapped[uuid.UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    job_type: Mapped[str] = mapped_column(String(16), nullable=False)  # fetch|import|reconcile
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'running'"))
    stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(postgresql.JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    logs: Mapped[list["PrgJobLog"]] = relationship("PrgJobLog", back_populates="job", cascade="all, delete-orphan")


class PrgJobLog(Base):
    __tablename__ = "prg_job_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(f"{Base.metadata.schema}.prg_jobs.id", ondelete="CASCADE"),
        nullable=False,
    )

    level: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'info'"))
    line: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    job: Mapped["PrgJob"] = relationship("PrgJob", back_populates="logs")
