from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

from crm.prg.schemas import (
    PrgStateOut,
    PrgImportRunIn,
    PrgLocalPointCreateIn,
    PrgPointOut,
    PrgReconcileRunOut,
    PrgReconcileQueueItemOut,
)
from crm.prg.services.prg_service import PrgService, PrgError
from crm.prg.services.reconcile_service import PrgReconcileService
from crm.db.models.prg import PrgReconcileQueue
from sqlalchemy import select


router = APIRouter(prefix="/prg", tags=["prg"])


@router.get(
    "/state",
    response_model=PrgStateOut,
)
def prg_state(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    st = PrgService(db).get_state()
    return PrgStateOut(
        dataset_version=st.dataset_version,
        dataset_updated_at=st.dataset_updated_at,
        last_import_at=st.last_import_at,
        last_delta_at=st.last_delta_at,
        last_reconcile_at=st.last_reconcile_at,
        source_url=st.source_url,
        checksum=st.checksum,
    )


@router.post(
    "/import/run",
    response_model=PrgStateOut,
)
def prg_import_run(
    payload: PrgImportRunIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    # Na tym etapie: “klocek pod adapter”. Realny fetch+delta dojdzie w kolejnym commit.
    st = PrgService(db).mark_import(mode=payload.mode)
    db.commit()
    return PrgStateOut(
        dataset_version=st.dataset_version,
        dataset_updated_at=st.dataset_updated_at,
        last_import_at=st.last_import_at,
        last_delta_at=st.last_delta_at,
        last_reconcile_at=st.last_reconcile_at,
        source_url=st.source_url,
        checksum=st.checksum,
    )


@router.post(
    "/local-points",
    response_model=PrgPointOut,
)
def prg_local_point_create(
    payload: PrgLocalPointCreateIn,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_CREATE)),
):
    try:
        p = PrgService(db).create_local_point(
            terc=payload.terc,
            simc=payload.simc,
            ulic=payload.ulic,
            no_street=payload.no_street,
            building_no=payload.building_no,
            local_no=payload.local_no,
            lat=payload.lat,
            lon=payload.lon,
            note=payload.note,
        )
        db.commit()

        lon, lat = p.point
        return PrgPointOut(
            id=int(p.id),
            source=p.source,
            prg_point_id=p.prg_point_id,
            local_point_id=p.local_point_id,
            terc=p.terc,
            simc=p.simc,
            ulic=p.ulic,
            no_street=bool(p.no_street),
            building_no=p.building_no,
            local_no=p.local_no,
            lat=float(lat),
            lon=float(lon),
            status=p.status,
            merged_into_id=p.merged_into_id,
            created_at=p.created_at,
            updated_at=p.updated_at,
            resolved_at=p.resolved_at,
            resolved_by_staff_id=p.resolved_by_staff_id,
            resolved_by_job=bool(p.resolved_by_job),
        )
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/local-points",
    response_model=list[PrgPointOut],
)
def prg_local_points_list(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_EDIT)),
):
    points = PrgService(db).list_local_pending(limit=200)
    out: list[PrgPointOut] = []
    for p in points:
        lon, lat = p.point
        out.append(
            PrgPointOut(
                id=int(p.id),
                source=p.source,
                prg_point_id=p.prg_point_id,
                local_point_id=p.local_point_id,
                terc=p.terc,
                simc=p.simc,
                ulic=p.ulic,
                no_street=bool(p.no_street),
                building_no=p.building_no,
                local_no=p.local_no,
                lat=float(lat),
                lon=float(lon),
                status=p.status,
                merged_into_id=p.merged_into_id,
                created_at=p.created_at,
                updated_at=p.updated_at,
                resolved_at=p.resolved_at,
                resolved_by_staff_id=p.resolved_by_staff_id,
                resolved_by_job=bool(p.resolved_by_job),
            )
        )
    return out


@router.post(
    "/reconcile/run",
    response_model=PrgReconcileRunOut,
)
def prg_reconcile_run(
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_RECONCILE_RUN)),
):
    stats = PrgReconcileService(db).run(actor_staff_id=int(me.id), job=False, distance_m=50.0)
    db.commit()
    return PrgReconcileRunOut(
        matched=stats.matched,
        queued=stats.queued,
        scanned_pending=stats.scanned_pending,
        finished_at=stats.finished_at,
    )


@router.get(
    "/reconcile/queue",
    response_model=list[PrgReconcileQueueItemOut],
)
def prg_reconcile_queue(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_APPROVE)),
):
    rows = list(
        db.execute(select(PrgReconcileQueue).where(PrgReconcileQueue.status == "pending").order_by(PrgReconcileQueue.created_at.asc()).limit(200)).scalars()
    )
    return [
        PrgReconcileQueueItemOut(
            id=int(r.id),
            local_point_id=int(r.local_point_id),
            status=r.status,
            candidates=list(r.candidates or []),
            created_at=r.created_at,
            decided_at=r.decided_at,
            decided_by_staff_id=r.decided_by_staff_id,
        )
        for r in rows
    ]
