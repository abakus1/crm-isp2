from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from math import radians, sin, cos, sqrt, atan2
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from crm.db.models.prg import PrgAddressPoint, PrgReconcileQueue, PrgDatasetState


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # odległość po kuli ziemskiej (metry), wystarczające do progu 50m
    R = 6371000.0
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dl / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


@dataclass
class ReconcileStats:
    matched: int
    queued: int
    scanned_pending: int
    finished_at: datetime


class PrgReconcileService:
    def __init__(self, db: Session):
        self.db = db

    def run(self, *, actor_staff_id: Optional[int], job: bool, distance_m: float = 50.0) -> ReconcileStats:
        now = datetime.now(timezone.utc)

        pendings = list(
            self.db.execute(
                select(PrgAddressPoint)
                .where(PrgAddressPoint.source == "PRG_LOCAL_PENDING", PrgAddressPoint.status == "active")
                .order_by(PrgAddressPoint.created_at.asc())
            ).scalars()
        )

        matched = 0
        queued = 0

        for lp in pendings:
            candidates = self._find_candidates(lp)
            if distance_m is not None and len(candidates) > 0:
                candidates = self._filter_by_distance(lp, candidates, distance_m)

            if len(candidates) == 1:
                self._upgrade_local_to_prg(lp, candidates[0], actor_staff_id=actor_staff_id, job=job)
                matched += 1
                continue

            if len(candidates) == 0:
                continue

            # niepewne: kolejka do ręcznego zatwierdzenia (ADMIN)
            self._enqueue(lp, candidates)
            queued += 1

        # update state marker
        st = self.db.execute(select(PrgDatasetState).where(PrgDatasetState.id == 1)).scalar_one_or_none()
        if not st:
            st = PrgDatasetState(id=1)
            self.db.add(st)
        st.last_reconcile_at = now
        self.db.add(st)

        self.db.flush()
        return ReconcileStats(matched=matched, queued=queued, scanned_pending=len(pendings), finished_at=now)

    def _find_candidates(self, lp: PrgAddressPoint) -> List[PrgAddressPoint]:
        q = select(PrgAddressPoint).where(
            PrgAddressPoint.source == "PRG_OFFICIAL",
            PrgAddressPoint.terc == lp.terc,
            PrgAddressPoint.simc == lp.simc,
            PrgAddressPoint.building_no_norm == lp.building_no_norm,
        )
        if lp.ulic is None:
            q = q.where(PrgAddressPoint.ulic.is_(None))
        else:
            q = q.where(PrgAddressPoint.ulic == lp.ulic)

        if lp.local_no_norm is None:
            q = q.where(PrgAddressPoint.local_no_norm.is_(None))
        else:
            q = q.where(PrgAddressPoint.local_no_norm == lp.local_no_norm)

        return list(self.db.execute(q.limit(10)).scalars())

    def _filter_by_distance(self, lp: PrgAddressPoint, cands: List[PrgAddressPoint], distance_m: float) -> List[PrgAddressPoint]:
        # lp.point = (lon,lat)
        lon1, lat1 = lp.point
        out: List[Tuple[float, PrgAddressPoint]] = []
        for c in cands:
            lon2, lat2 = c.point
            d = _haversine_m(lat1, lon1, lat2, lon2)
            if d <= distance_m:
                out.append((d, c))
        out.sort(key=lambda x: x[0])
        return [c for _, c in out]

    def _upgrade_local_to_prg(self, lp: PrgAddressPoint, prg: PrgAddressPoint, *, actor_staff_id: Optional[int], job: bool) -> None:
        # “zero bólu”: ten sam rekord ID, tylko zmieniamy źródło i dopinamy prg_point_id
        lp.prg_point_id = prg.prg_point_id
        lp.source = "PRG_OFFICIAL"
        lp.resolved_at = datetime.now(timezone.utc)
        lp.resolved_by_staff_id = actor_staff_id
        lp.resolved_by_job = bool(job)
        self.db.add(lp)

    def _enqueue(self, lp: PrgAddressPoint, cands: List[PrgAddressPoint]) -> None:
        # unikamy duplikatów kolejki
        exists = self.db.execute(
            select(PrgReconcileQueue).where(PrgReconcileQueue.local_point_id == lp.id, PrgReconcileQueue.status == "pending")
        ).scalar_one_or_none()
        if exists:
            return

        items: List[Dict[str, Any]] = []
        lon1, lat1 = lp.point
        for c in cands:
            lon2, lat2 = c.point
            items.append(
                {
                    "candidate_id": c.id,
                    "prg_point_id": c.prg_point_id,
                    "lat": lat2,
                    "lon": lon2,
                    "distance_m": _haversine_m(lat1, lon1, lat2, lon2),
                }
            )

        q = PrgReconcileQueue(
            local_point_id=lp.id,
            status="pending",
            candidates=items,
        )
        self.db.add(q)
