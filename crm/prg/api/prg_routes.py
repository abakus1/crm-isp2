# crm/prg/api/prg_routes.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, BackgroundTasks, Request
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, or_, func
from uuid import UUID

from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

from crm.db.models.prg import PrgReconcileQueue, PrgJob, PrgJobLog, PrgAddressPoint, PrgAdruniBuildingNumber
from crm.prg.schemas import (
    PrgStateOut,
    PrgImportRunIn,
    PrgImportFileOut,
    PrgLocalPointCreateIn,
    PrgPointOut,
    PrgReconcileRunOut,
    PrgReconcileQueueItemOut,
    PrgJobStartOut,
    PrgJobOut,
    PrgJobWithLogsOut,
    PrgJobLogOut,
    PrgPlaceSuggestOut,
    PrgStreetSuggestOut,
    PrgStreetGlobalSuggestOut,
    PrgBuildingOut,
)
from crm.prg.services.prg_service import PrgService, PrgError
from crm.prg.services.reconcile_service import PrgReconcileService

from crm.core.audit.activity_context import set_activity_entity


router = APIRouter(prefix="/prg", tags=["prg"])


def _norm_q(q: str) -> str:
    return (q or "").strip()


def _point_to_out(p) -> PrgPointOut:
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


def _job_to_out(j: PrgJob) -> PrgJobOut:
    return PrgJobOut(
        id=j.id,
        job_type=j.job_type,
        status=j.status,
        stage=j.stage,
        message=j.message,
        meta=dict(j.meta or {}),
        error=j.error,
        started_at=j.started_at,
        updated_at=j.updated_at,
        finished_at=j.finished_at,
    )


@router.get("/state", response_model=PrgStateOut)
def prg_state(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    st = PrgService(db).get_state()

    # W PRG mamy dwa tryby źródła danych:
    # 1) "points" (punkty adresowe z koordynatami) -> tabela prg_address_points
    # 2) "adruni" (numery budynków / rekordy ADRUNI bez koordynatów) -> tabela prg_adruni_building_numbers
    #
    # UI w MVP liczyło tylko "address_points_count". Jeśli importujemy ADRUNI, ta tabela jest pusta,
    # więc UI pokazywało 0 mimo, że ADRUNI jest pełne. Naprawa: liczmy oba i zwracajmy oba.
    address_points_count = int(
        db.execute(
            select(func.count()).select_from(PrgAddressPoint).where(PrgAddressPoint.status == "active")
        ).scalar_one()
        or 0
    )

    adruni_count = int(
        db.execute(select(func.count()).select_from(PrgAdruniBuildingNumber)).scalar_one() or 0
    )

    # Backwards-compat: jeśli punktów jest 0, a ADRUNI ma rekordy, podstawiamy do legacy pola.
    legacy_count = address_points_count if address_points_count > 0 else adruni_count

    return PrgStateOut(
        dataset_version=st.dataset_version,
        dataset_updated_at=st.dataset_updated_at,
        last_import_at=st.last_import_at,
        last_delta_at=st.last_delta_at,
        last_reconcile_at=st.last_reconcile_at,
        source_url=st.source_url,
        checksum=st.checksum,
        address_points_count=int(legacy_count),
        adruni_building_numbers_count=int(adruni_count),
    )


@router.post("/fetch/run", response_model=PrgJobStartOut)
def prg_fetch_run(
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    try:
        job = PrgService(db).start_fetch_job(actor_staff_id=int(me.id))
        # activity_log: encja = job PRG
        set_activity_entity(request, entity_type="prg_job", entity_id=str(job.id))
        db.commit()
        bg.add_task(PrgService.run_fetch_job_background, str(job.id))
        return PrgJobStartOut(job=_job_to_out(job))
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/import/run", response_model=PrgJobStartOut)
def prg_import_run(
    payload: PrgImportRunIn,
    request: Request,
    bg: BackgroundTasks,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    try:
        job = PrgService(db).start_import_job(mode=payload.mode, actor_staff_id=int(me.id))
        set_activity_entity(request, entity_type="prg_job", entity_id=str(job.id))
        db.commit()
        bg.add_task(PrgService.run_import_job_background, str(job.id))
        return PrgJobStartOut(job=_job_to_out(job))
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/jobs/cancel", response_model=PrgJobOut)
def prg_jobs_cancel(
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    """Przerywa aktywny job PRG (status='running' → 'cancelled').

    Kontrakt:
    - ustawiamy status='cancelled' + stage='cancelling'
    - NIE ustawiamy finished_at tutaj — runner kończy job "czysto" (sprzątanie lock/tmp)
    """
    try:
        job = PrgService(db).cancel_active_job(actor_staff_id=int(me.id))
        set_activity_entity(request, entity_type="prg_job", entity_id=str(job.id))
        db.commit()
        return _job_to_out(job)
    except PrgError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/jobs/latest", response_model=PrgJobOut)
def prg_jobs_latest(
    job_type: str = Query(..., description="fetch|import|reconcile"),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    j = (
        db.execute(
            select(PrgJob)
            .where(PrgJob.job_type == job_type)
            .order_by(PrgJob.started_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if not j:
        raise HTTPException(status_code=404, detail="Brak jobów tego typu.")
    return _job_to_out(j)


@router.get("/jobs/active", response_model=PrgJobWithLogsOut | None)
def prg_jobs_active(
    logs_limit: int = Query(default=30, ge=0, le=500),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    """
    Zwraca najnowszy aktywny job PRG:
      - status='running'
      - albo status='cancelled' i finished_at IS NULL (czyli "cancelling" w toku)
    wraz z ostatnimi logami. Jeśli brak aktywnego joba → null.
    """

    j = (
        db.execute(
            select(PrgJob)
            .where(
                or_(
                    PrgJob.status == "running",
                    and_(PrgJob.status == "cancelled", PrgJob.finished_at.is_(None)),
                )
            )
            .order_by(PrgJob.updated_at.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )

    if not j:
        return None

    logs: list[PrgJobLogOut] = []

    if logs_limit > 0:
        rows = (
            db.execute(
                select(PrgJobLog)
                .where(PrgJobLog.job_id == j.id)
                .order_by(PrgJobLog.created_at.desc())
                .limit(logs_limit)
            )
            .scalars()
            .all()
        )

        rows = list(reversed(rows))  # rosnąco dla UI

        logs = [
            PrgJobLogOut(
                id=int(r.id),
                level=r.level,
                line=r.line,
                created_at=r.created_at,
            )
            for r in rows
        ]

    return PrgJobWithLogsOut(
        **_job_to_out(j).model_dump(),
        logs=logs,
    )


@router.get("/jobs/{job_id}", response_model=PrgJobWithLogsOut)
def prg_job_get(
    job_id: UUID,
    logs_limit: int = Query(default=30, ge=0, le=500),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    j = db.execute(select(PrgJob).where(PrgJob.id == job_id)).scalar_one_or_none()
    if not j:
        raise HTTPException(status_code=404, detail="Job nie istnieje.")

    logs = []
    if logs_limit > 0:
        rows = (
            db.execute(
                select(PrgJobLog)
                .where(PrgJobLog.job_id == job_id)
                .order_by(PrgJobLog.created_at.desc())
                .limit(logs_limit)
            )
            .scalars()
            .all()
        )
        # odwracamy, żeby UI widziało rosnąco
        rows = list(reversed(rows))
        logs = [
            PrgJobLogOut(id=int(r.id), level=r.level, line=r.line, created_at=r.created_at)
            for r in rows
        ]

    out = PrgJobWithLogsOut(**_job_to_out(j).model_dump(), logs=logs)
    return out


@router.get("/imports", response_model=list[PrgImportFileOut])
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


@router.post("/import/upload", response_model=PrgImportFileOut)
async def prg_import_upload(
    file: UploadFile = File(...),
    mode: str = Query(default="delta", description="full|delta"),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    try:
        content = await file.read()
        imp = PrgService(db).enqueue_file_from_upload(filename=file.filename or "prg.zip", content=content, mode=mode)
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


@router.post("/local-points", response_model=PrgPointOut)
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


@router.get("/local-points", response_model=list[PrgPointOut])
def prg_local_points_list(
    limit: int = Query(default=200, ge=1, le=2000),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_LOCAL_POINT_EDIT)),
):
    rows = PrgService(db).list_local_pending(limit=limit)
    return [_point_to_out(p) for p in rows]


@router.post("/reconcile/run", response_model=PrgReconcileRunOut)
def prg_reconcile_run(
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.PRG_RECONCILE_RUN)),
):
    try:
        PrgService(db).assert_no_active_job()
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


@router.get("/reconcile/queue", response_model=list[PrgReconcileQueueItemOut])
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


# -------------------------
# ADRUNI lookup (place → street → buildings)
# -------------------------


@router.get("/lookup/places", response_model=list[PrgPlaceSuggestOut])
def prg_lookup_places(
    q: str = Query(..., min_length=1, max_length=64, description="Prefix nazwy miejscowości"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    qq = _norm_q(q)
    if len(qq) < 1:
        return []

    # place_name jest w ADRUNI -> szukamy po prefixie (case-insensitive)
    # i grupujemy po (terc, simc, place_name)
    rows = db.execute(
        select(
            PrgAdruniBuildingNumber.place_name,
            PrgAdruniBuildingNumber.terc,
            PrgAdruniBuildingNumber.simc,
            func.count().label("cnt"),
        )
        .where(PrgAdruniBuildingNumber.place_name.is_not(None))
        .where(func.lower(PrgAdruniBuildingNumber.place_name).like(func.lower(qq) + "%"))
        .group_by(
            PrgAdruniBuildingNumber.place_name,
            PrgAdruniBuildingNumber.terc,
            PrgAdruniBuildingNumber.simc,
        )
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    return [
        PrgPlaceSuggestOut(
            place_name=str(r[0]),
            terc=str(r[1]),
            simc=str(r[2]),
            buildings_count=int(r[3] or 0),
        )
        for r in rows
    ]


@router.get("/lookup/streets", response_model=list[PrgStreetSuggestOut])
def prg_lookup_streets(
    terc: str = Query(..., min_length=1, max_length=8),
    simc: str = Query(..., min_length=1, max_length=8),
    q: str = Query(
        "",
        max_length=64,
        description="Fraza nazwy ulicy: słowa mogą występować w dowolnym miejscu (np. 'Jana Pawła')",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    qq = _norm_q(q)

    stmt = (
        select(
            PrgAdruniBuildingNumber.street_name,
            PrgAdruniBuildingNumber.ulic,
            func.count().label("cnt"),
        )
        .where(PrgAdruniBuildingNumber.terc == terc)
        .where(PrgAdruniBuildingNumber.simc == simc)
        .where(PrgAdruniBuildingNumber.ulic.is_not(None))
        .where(PrgAdruniBuildingNumber.street_name.is_not(None))
    )

    # ✅ Leniwe wyszukiwanie: każde słowo musi wystąpić gdziekolwiek w nazwie
    if qq:
        terms = [t for t in qq.split() if t]
        for t in terms:
            stmt = stmt.where(func.lower(PrgAdruniBuildingNumber.street_name).like("%" + t.lower() + "%"))

    rows = db.execute(
        stmt.group_by(PrgAdruniBuildingNumber.street_name, PrgAdruniBuildingNumber.ulic)
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    return [
        PrgStreetSuggestOut(
            street_name=str(r[0]),
            ulic=str(r[1]),
            buildings_count=int(r[2] or 0),
        )
        for r in rows
    ]


@router.get("/lookup/streets-global", response_model=list[PrgStreetGlobalSuggestOut])
def prg_lookup_streets_global(
    q: str = Query(
        ...,
        min_length=2,
        max_length=64,
        description="Fraza nazwy ulicy: słowa w dowolnym miejscu (np. 'Jana Pawła')",
    ),
    place: str = Query(
        "",
        max_length=64,
        description="Opcjonalnie: lokalizacja/miejscowość (też po słowach, a nie tylko prefix)",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    qq = _norm_q(q)
    pq = _norm_q(place)

    stmt = (
        select(
            PrgAdruniBuildingNumber.street_name,
            PrgAdruniBuildingNumber.ulic,
            PrgAdruniBuildingNumber.place_name,
            PrgAdruniBuildingNumber.terc,
            PrgAdruniBuildingNumber.simc,
            func.count().label("cnt"),
        )
        .where(PrgAdruniBuildingNumber.ulic.is_not(None))
        .where(PrgAdruniBuildingNumber.street_name.is_not(None))
        .where(PrgAdruniBuildingNumber.place_name.is_not(None))
    )

    # ✅ ulica: tokeny w dowolnym miejscu
    s_terms = [t for t in qq.split() if t]
    for t in s_terms:
        stmt = stmt.where(func.lower(PrgAdruniBuildingNumber.street_name).like("%" + t.lower() + "%"))

    # ✅ place opcjonalnie: tokeny w dowolnym miejscu
    if pq:
        p_terms = [t for t in pq.split() if t]
        for t in p_terms:
            stmt = stmt.where(func.lower(PrgAdruniBuildingNumber.place_name).like("%" + t.lower() + "%"))

    rows = db.execute(
        stmt.group_by(
            PrgAdruniBuildingNumber.street_name,
            PrgAdruniBuildingNumber.ulic,
            PrgAdruniBuildingNumber.place_name,
            PrgAdruniBuildingNumber.terc,
            PrgAdruniBuildingNumber.simc,
        )
        .order_by(func.count().desc())
        .limit(limit)
    ).all()

    return [
        PrgStreetGlobalSuggestOut(
            street_name=str(r[0]),
            ulic=str(r[1]),
            place_name=str(r[2]),
            terc=str(r[3]),
            simc=str(r[4]),
            buildings_count=int(r[5] or 0),
        )
        for r in rows
    ]


@router.get("/lookup/buildings", response_model=list[PrgBuildingOut])
def prg_lookup_buildings(
    terc: str = Query(..., min_length=1, max_length=8),
    simc: str = Query(..., min_length=1, max_length=8),
    ulic: str = Query(..., min_length=1, max_length=8),
    limit: int = Query(default=500, ge=1, le=5000),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.PRG_IMPORT_RUN)),
):
    # Zwracamy listę budynków na ulicy w danej miejscowości.
    # Uwaga: potrafi być dużo – limit kontroluje payload.
    rows = db.execute(
        select(
            PrgAdruniBuildingNumber.building_no,
            PrgAdruniBuildingNumber.terc,
            PrgAdruniBuildingNumber.simc,
            PrgAdruniBuildingNumber.ulic,
        )
        .where(PrgAdruniBuildingNumber.terc == terc)
        .where(PrgAdruniBuildingNumber.simc == simc)
        .where(PrgAdruniBuildingNumber.ulic == ulic)
        .order_by(PrgAdruniBuildingNumber.building_no_norm.asc(), PrgAdruniBuildingNumber.building_no.asc())
        .limit(limit)
    ).all()

    return [
        PrgBuildingOut(
            building_no=str(r[0]),
            terc=str(r[1]),
            simc=str(r[2]),
            ulic=str(r[3]) if r[3] is not None else None,
        )
        for r in rows
    ]