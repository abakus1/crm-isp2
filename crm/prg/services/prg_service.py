from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from crm.db.models.prg import PrgDatasetState, PrgAddressPoint
from crm.prg.utils.normalize import normalize_building_no, normalize_local_no


class PrgError(RuntimeError):
    pass


class PrgService:
    def __init__(self, db: Session):
        self.db = db

    def get_state(self) -> PrgDatasetState:
        st = self.db.execute(select(PrgDatasetState).where(PrgDatasetState.id == 1)).scalar_one_or_none()
        if st:
            return st
        st = PrgDatasetState(id=1)
        self.db.add(st)
        self.db.flush()
        return st

    def mark_import(self, mode: str, source_url: Optional[str] = None, checksum: Optional[str] = None) -> PrgDatasetState:
        st = self.get_state()
        now = datetime.now(timezone.utc)
        st.last_import_at = now
        if mode == "delta":
            st.last_delta_at = now
        if source_url:
            st.source_url = source_url
        if checksum:
            st.checksum = checksum
        self.db.add(st)
        self.db.flush()
        return st

    def create_local_point(
        self,
        *,
        terc: str,
        simc: str,
        ulic: Optional[str],
        no_street: bool,
        building_no: str,
        local_no: Optional[str],
        lat: float,
        lon: float,
        note: Optional[str],
    ) -> PrgAddressPoint:
        if no_street:
            ulic = None

        b_norm = normalize_building_no(building_no)
        l_norm = normalize_local_no(local_no)
        if not b_norm:
            raise PrgError("Nieprawidłowy numer budynku.")

        # Unikatowość lokalnego pending po normalizacji
        q = select(PrgAddressPoint).where(
            PrgAddressPoint.source == "PRG_LOCAL_PENDING",
            PrgAddressPoint.terc == terc,
            PrgAddressPoint.simc == simc,
            PrgAddressPoint.ulic.is_(None) if ulic is None else PrgAddressPoint.ulic == ulic,
            PrgAddressPoint.building_no_norm == b_norm,
        )
        if l_norm is None:
            q = q.where(PrgAddressPoint.local_no_norm.is_(None))
        else:
            q = q.where(PrgAddressPoint.local_no_norm == l_norm)
        exists = self.db.execute(q.limit(1)).scalar_one_or_none()
        if exists:
            raise PrgError("Taki lokalny punkt już istnieje (po normalizacji numeru).")

        p = PrgAddressPoint(
            source="PRG_LOCAL_PENDING",
            prg_point_id=None,
            local_point_id=str(uuid.uuid4()),
            terc=terc,
            simc=simc,
            ulic=ulic,
            no_street=bool(no_street),
            building_no=str(building_no).strip(),
            building_no_norm=b_norm,
            local_no=str(local_no).strip() if local_no else None,
            local_no_norm=l_norm,
            point=(float(lon), float(lat)),
            note=note,
            status="active",
        )
        self.db.add(p)
        self.db.flush()
        return p

    def list_local_pending(self, limit: int = 200) -> List[PrgAddressPoint]:
        return list(
            self.db.execute(
                select(PrgAddressPoint)
                .where(PrgAddressPoint.source == "PRG_LOCAL_PENDING", PrgAddressPoint.status == "active")
                .order_by(PrgAddressPoint.created_at.desc())
                .limit(limit)
            ).scalars()
        )
