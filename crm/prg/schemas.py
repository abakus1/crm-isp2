# crm/prg/schemas.py
from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

from pydantic import BaseModel, Field


class PrgStateOut(BaseModel):
    dataset_version: Optional[str] = None
    dataset_updated_at: Optional[datetime] = None
    last_import_at: Optional[datetime] = None
    last_delta_at: Optional[datetime] = None
    last_reconcile_at: Optional[datetime] = None
    source_url: Optional[str] = None
    checksum: Optional[str] = None
    # Backwards-compatible: UI w pierwszej wersji pokazywało tylko "address_points_count".
    # W trybie ADRUNI (numery budynków) nie mamy punktów geolokalizacyjnych, więc liczymy rekordy ADRUNI.
    address_points_count: int = 0
    adruni_building_numbers_count: int = 0


class PrgImportRunIn(BaseModel):
    mode: str = Field(default="delta", description="full|delta")


class PrgJobLogOut(BaseModel):
    id: int
    level: str
    line: str
    created_at: datetime


class PrgJobOut(BaseModel):
    id: UUID
    job_type: str
    status: str
    stage: Optional[str] = None
    message: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    started_at: datetime
    updated_at: datetime
    finished_at: Optional[datetime] = None


class PrgJobWithLogsOut(PrgJobOut):
    logs: List[PrgJobLogOut] = Field(default_factory=list)


class PrgJobStartOut(BaseModel):
    job: PrgJobOut


class PrgImportFileOut(BaseModel):
    id: int
    filename: str
    size_bytes: int
    mode: str
    status: str
    checksum: str
    rows_inserted: int
    rows_updated: int
    error: Optional[str] = None
    imported_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PrgLocalPointCreateIn(BaseModel):
    terc: str
    simc: str
    ulic: Optional[str] = None
    no_street: bool = False
    building_no: str
    local_no: Optional[str] = None
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


# -------------------------
# PRG lookup (ADRUNI)
# -------------------------


class PrgPlaceSuggestOut(BaseModel):
    place_name: str
    terc: str
    simc: str
    buildings_count: int = 0


class PrgStreetSuggestOut(BaseModel):
    street_name: str
    ulic: str
    buildings_count: int = 0


class PrgBuildingOut(BaseModel):
    building_no: str
    terc: str
    simc: str
    ulic: Optional[str] = None