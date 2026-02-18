from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class PrgStateOut(BaseModel):
    dataset_version: Optional[str] = None
    dataset_updated_at: Optional[datetime] = None
    last_import_at: Optional[datetime] = None
    last_delta_at: Optional[datetime] = None
    last_reconcile_at: Optional[datetime] = None
    source_url: Optional[str] = None
    checksum: Optional[str] = None


class PrgImportRunIn(BaseModel):
    mode: str = Field(default="delta", description="full|delta")


class PrgLocalPointCreateIn(BaseModel):
    terc: str
    simc: str
    ulic: Optional[str] = None
    no_street: bool = False

    building_no: str
    local_no: Optional[str] = None

    # Postgres POINT: (x,y) = (lon,lat). UI zwykle daje lat/lon.
    lat: float
    lon: float

    note: Optional[str] = None


class PrgPointOut(BaseModel):
    id: int
    source: str
    prg_point_id: Optional[str] = None
    local_point_id: Optional[str] = None

    terc: str
    simc: str
    ulic: Optional[str] = None
    no_street: bool

    building_no: str
    local_no: Optional[str] = None

    lat: float
    lon: float

    status: str
    merged_into_id: Optional[int] = None

    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by_staff_id: Optional[int] = None
    resolved_by_job: bool = False


class PrgReconcileRunOut(BaseModel):
    matched: int
    queued: int
    scanned_pending: int
    finished_at: datetime


class PrgReconcileQueueItemOut(BaseModel):
    id: int
    local_point_id: int
    status: str
    candidates: List[dict]
    created_at: datetime
    decided_at: Optional[datetime] = None
    decided_by_staff_id: Optional[int] = None
