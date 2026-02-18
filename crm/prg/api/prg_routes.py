from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

from crm.db.models.prg import PrgReconcileQueue

from crm.prg.schemas import (
    PrgStateOut,
    PrgImportRunIn,
    PrgImportFileOut,
    PrgFetchRunOut,
    PrgLocalPointCreateIn,
    PrgPointOut,
    PrgReconcileRunOut,
    PrgReconcileQueueItemOut,
)
from crm.prg.services.prg_service import PrgService, PrgError
from crm.prg.services.reconcile_service import PrgReconcileService


router = APIRouter(prefix="/prg", tags=["prg"])


def _point_to_out(p) -> PrgPointOut:
    # Postgres POINT: (x,y) = (lon,lat)
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
    "/fetch/run",
    response_model=PrgFetchRunOut,
)
def prg_fetch_run(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),  # nie mnożymy akcji
):
    try:
        res = PrgService(db).fetch_geoportal_zip()
        return PrgFetchRunOut(
            changed=bool(res["changed"]),
            filename=res.get("filename"),
            sha256=res.get("sha256"),
            bytes_downloaded=int(res.get("bytes_downloaded") or 0),
            message=res.get("message"),
        )
    except PrgError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/import/run",
    response_model=PrgStateOut,
)
def prg_import_run(
    payload: PrgImportRunIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    try:
        st, _imp, _stats = PrgService(db).run_next_import_from_dir(mode=payload.mode)
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
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/imports",
    response_model=list[PrgImportFileOut],
)
def prg_imports_list(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    rows = PrgService(db).list_import_files(limit=50)
    return [
        PrgImportFileOut(
            id=int(r.id),
            filename=str(r.filename),
            size_bytes=int(r.size_bytes),
            mode=r.mode,
            status=r.status,
            checksum=r.checksum,
            rows_inserted=int(r.rows_inserted),
            rows_updated=int(r.rows_updated),
            error=r.error,
            imported_at=r.imported_at,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]


@router.post(
    "/import/upload",
    response_model=PrgImportFileOut,
)
async def prg_import_upload(
    file: UploadFile = File(...),
    mode: str = Query(default="delta", description="full|delta"),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    try:
        content = await file.read()
        imp = PrgService(db).enqueue_file_from_upload(
            filename=file.filename or "prg.zip",
            content=content,
            mode=mode,
        )
        db.commit()
        return PrgImportFileOut(
            id=int(imp.id),
            filename=str(imp.filename),
            size_bytes=int(imp.size_bytes),
            mode=imp.mode,
            status=imp.status,
            checksum=imp.checksum,
            rows_inserted=int(imp.rows_inserted),
            rows_updated=int(imp.rows_updated),
            error=imp.error,
            imported_at=imp.imported_at,
            created_at=imp.created_at,
            updated_at=imp.updated_at,
        )
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/local-points",
    response_model=PrgPointOut,
)
def prg_local_point_create(
    payload: PrgLocalPointCreateIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_CREATE)),
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
        return _point_to_out(p)
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/local-points",
    response_model=list[PrgPointOut],
)
def prg_local_points_list(
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_EDIT)),
):
    rows = PrgService(db).list_local_pending(limit=limit)
    return [_point_to_out(p) for p in rows]


@router.post(
    "/reconcile/run",
    response_model=PrgReconcileRunOut,
)
def prg_reconcile_run(
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_RECONCILE_RUN)),
):
    try:
        stats = PrgReconcileService(db).run(actor_staff_id=int(me.id), job=False)
        db.commit()
        return PrgReconcileRunOut(
            matched=int(stats.matched),
            queued=int(stats.queued),
            scanned_pending=int(stats.scanned_pending),
            finished_at=stats.finished_at,
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/reconcile/queue",
    response_model=list[PrgReconcileQueueItemOut],
)
def prg_reconcile_queue_list(
    status: str = Query(default="pending", description="pending|resolved|rejected"),
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_RECONCILE_RUN)),
):
    rows = list(
        db.execute(
            select(PrgReconcileQueue)
            .where(PrgReconcileQueue.status == status)
            .order_by(PrgReconcileQueue.created_at.desc())
            .limit(limit)
        ).scalars()
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
