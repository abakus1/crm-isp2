from __future__ import annotations

from typing import Any, Dict, Iterable, Optional, Tuple
import hashlib
import itertools
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

from crm.app.config import get_settings
from crm.db.models.prg import (
    PrgAddressPoint,
    PrgAdruniBuildingNumber,
    PrgImportFile,
    PrgJob,
)
from crm.prg.utils.normalize import normalize_building_no, normalize_local_no
from crm.prg.services.reconcile_service import PrgReconcileService

from .prg_common import (
    now_utc,
    get_any,
    to_float,
    to_int,
    is_truthy,
    puwg1992_to_wgs84,
    adruni_tokens,
    extract_first_by_len,
    display_building_no,
    display_local_no,
    stable_bigint_id,
)
from .prg_errors import PrgError
from .prg_stream import iter_rows_from_file_path


def run_import(svc: Any, job: PrgJob, *, mode: str) -> None:
    fp_lock, lock_path = svc._acquire_lockfile("prg_import")
    try:
        settings = get_settings()
        import_dir = svc.ensure_import_dir()

        files = [
            p
            for p in import_dir.iterdir()
            if p.is_file() and p.suffix.lower() in (".zip", ".csv", ".tsv", ".txt")
        ]
        if not files:
            svc._job_update(job, status="skipped", stage="done", finished=True, message="Brak plików do importu w katalogu PRG.")
            return

        files.sort(key=lambda p: p.stat().st_mtime)
        path = files[0]

        svc._job_update(job, stage="opening", message=f"Otwieram plik: {path.name}", meta_patch={"filename": path.name})

        raw = path.read_bytes()
        checksum = hashlib.sha256(raw).hexdigest()

        imp = svc.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
        if not imp:
            imp = PrgImportFile(filename=path.name, size_bytes=len(raw), mode=mode, status="pending", checksum=checksum)
            svc.db.add(imp)
            svc.db.flush()

        if imp.status == "done":
            svc._job_update(
                job,
                status="success",
                stage="done",
                finished=True,
                message="Plik już był zaimportowany (checksum).",
                meta_patch={"checksum": checksum},
            )
            return

        imp.status = "processing"
        imp.mode = mode
        svc.db.add(imp)
        svc.db.flush()

        svc._job_update(job, stage="reading_headers", message="Czytam nagłówki i wykrywam separator…")

        rows_iter, total_hint = iter_rows_from_file_path(svc, path, job=job)

        it = iter(rows_iter)
        first = next(it, None)
        if first is None:
            raise PrgError("Plik PRG jest pusty (brak wierszy).")
        keys = set(first.keys())
        rows_iter2 = itertools.chain([first], it)

        is_adruni = ("adruni" in keys) and (("teryt" in keys or "terc" in keys or "teryt_gmina" in keys) and ("numer" in keys or "building_no" in keys))

        svc._job_update(
            job,
            stage="processing_rows",
            message="Przetwarzam wiersze…",
            meta_patch={
                "rows_seen": 0,
                "inserted": 0,
                "updated": 0,
                "skipped": 0,
                "rows_total_hint": total_hint,
                "import_kind": "adruni" if is_adruni else "address_points",
                "skipped_logged": 0,
                "skipped_log_limit": svc._skip_logger_config()[1],
            },
        )
        svc._job_log(job.id, f"START import (stream) kind={'ADRUNI' if is_adruni else 'ADDRESS_POINTS'} mode={mode}")

        if is_adruni:
            inserted, updated, skipped, rows_seen = upsert_adruni_building_numbers_with_progress(svc, job=job, rows=rows_iter2, mode=mode)
        else:
            inserted, updated, skipped, rows_seen = upsert_official_points_with_progress(svc, job=job, rows=rows_iter2, mode=mode)

        imp.status = "done"
        imp.rows_inserted = inserted
        imp.rows_updated = updated
        imp.error = None
        imp.imported_at = now_utc()
        svc.db.add(imp)

        svc.mark_import(mode=mode, checksum=checksum)

        svc._job_log(job.id, f"DONE import rows_seen={rows_seen} inserted={inserted} updated={updated} skipped={skipped}")
        svc._job_update(
            job,
            stage="finalizing",
            message="Finalizuję i zapisuję wynik…",
            meta_patch={"rows_seen": rows_seen, "inserted": inserted, "updated": updated, "skipped": skipped, "checksum": checksum},
        )

        if settings.prg_auto_reconcile and (not is_adruni):
            svc._job_update(job, stage="reconcile", message="Uruchamiam reconcile…")
            stats = PrgReconcileService(svc.db).run(actor_staff_id=None, job=True, distance_m=settings.prg_reconcile_distance_m)
            svc._job_update(
                job,
                meta_patch={
                    "reconcile": {
                        "matched": stats.matched,
                        "queued": stats.queued,
                        "scanned_pending": stats.scanned_pending,
                        "finished_at": stats.finished_at.isoformat(),
                    }
                },
            )

        if settings.prg_delete_file_after_import:
            try:
                path.unlink(missing_ok=True)
            except Exception:
                pass

        svc.db.flush()
        svc._job_update(job, status="success", stage="done", finished=True, message="Import PRG zakończony ✅")
    finally:
        svc._release_lockfile(fp_lock, lock_path)


def upsert_adruni_building_numbers_with_progress(
    svc: Any,
    *,
    job: PrgJob,
    rows: Iterable[Dict[str, Any]],
    mode: str,
) -> Tuple[int, int, int, int]:
    inserted = 0
    updated = 0
    skipped = 0
    rows_seen = 0

    skipped_validation = 0
    skipped_conflict = 0

    log_skipped, log_limit = svc._skip_logger_config()
    skipped_logged = 0
    skip_reasons: dict[str, int] = {}

    log_buf: list[str] = []
    last_log_flush = now_utc()

    def bump_reason(reason: str) -> None:
        skip_reasons[reason] = int(skip_reasons.get(reason, 0)) + 1

    def log_skip(reason: str, row: Dict[str, Any]) -> None:
        nonlocal skipped_logged, log_buf
        bump_reason(reason)
        if not log_skipped or skipped_logged >= log_limit:
            return
        teryt = row.get("teryt") or row.get("terc") or row.get("teryt_gmina")
        numer = row.get("numer") or row.get("building_no") or row.get("nr_domu")
        adr = row.get("adruni")
        miejsc = row.get("miejscowosc")
        ulica = row.get("ulica")
        line = (
            f"[skip][adruni] row={rows_seen} reason={reason} "
            f"teryt={teryt!s} numer={numer!s} miejscowosc={miejsc!s} ulica={ulica!s} "
            f"adruni={str(adr)[:120]!s}"
        )
        log_buf.append(line)
        skipped_logged += 1

    def flush_logs_if_needed(force: bool = False) -> None:
        nonlocal log_buf, last_log_flush
        if not log_buf:
            return
        now = now_utc()
        if force or (now - last_log_flush).total_seconds() >= 0.5 or len(log_buf) >= 250:
            svc._job_log_bulk(job.id, log_buf, level="warn")
            log_buf = []
            last_log_flush = now

    if mode == "full":
        svc._job_log(job.id, "ADRUNI full: TRUNCATE crm.prg_adruni_building_numbers")
        svc.db.execute(text("TRUNCATE TABLE crm.prg_adruni_building_numbers"))
        svc.db.commit()

    TERYT_KEYS = ["teryt", "terc", "teryt_gmina", "gmina_terc"]
    PLACE_KEYS = ["miejscowosc", "place_name", "miejscowość"]
    STREET_NAME_KEYS = ["ulica", "street_name"]
    BUILD_KEYS = ["numer", "building_no", "nr_domu", "nr_budynku"]
    ADRUNI_KEYS = ["adruni", "raw", "record"]

    batch: list[dict[str, Any]] = []
    BATCH_SIZE = 5000
    last_progress_at = now_utc()

    def flush_batch() -> None:
        nonlocal batch, inserted, skipped, skipped_conflict
        if not batch:
            return

        with_ulic = [b for b in batch if b.get("ulic") is not None]
        no_ulic = [b for b in batch if b.get("ulic") is None]

        local_inserted = 0

        if with_ulic:
            stmt1 = (
                insert(PrgAdruniBuildingNumber)
                .values(with_ulic)
                .on_conflict_do_nothing(
                    index_elements=[
                        PrgAdruniBuildingNumber.terc,
                        PrgAdruniBuildingNumber.simc,
                        PrgAdruniBuildingNumber.ulic,
                        PrgAdruniBuildingNumber.building_no_norm,
                    ],
                    index_where=PrgAdruniBuildingNumber.ulic.isnot(None),
                )
                .returning(PrgAdruniBuildingNumber.id)
            )
            res1 = svc.db.execute(stmt1)
            local_inserted += len(res1.fetchall())

        if no_ulic:
            stmt2 = (
                insert(PrgAdruniBuildingNumber)
                .values(no_ulic)
                .on_conflict_do_nothing(
                    index_elements=[
                        PrgAdruniBuildingNumber.terc,
                        PrgAdruniBuildingNumber.simc,
                        PrgAdruniBuildingNumber.building_no_norm,
                    ],
                    index_where=PrgAdruniBuildingNumber.ulic.is_(None),
                )
                .returning(PrgAdruniBuildingNumber.id)
            )
            res2 = svc.db.execute(stmt2)
            local_inserted += len(res2.fetchall())

        svc.db.commit()

        inserted += local_inserted
        conflicts = (len(batch) - local_inserted)
        skipped += conflicts
        skipped_conflict += conflicts
        batch = []

    for row in rows:
        rows_seen += 1

        teryt = get_any(row, TERYT_KEYS)
        building_no_raw = get_any(row, BUILD_KEYS)
        adruni_raw = get_any(row, ADRUNI_KEYS)

        if not teryt:
            skipped += 1
            skipped_validation += 1
            log_skip("missing_teryt", row)
            flush_logs_if_needed()
            continue
        if not building_no_raw:
            skipped += 1
            skipped_validation += 1
            log_skip("missing_building_no", row)
            flush_logs_if_needed()
            continue
        if not adruni_raw:
            skipped += 1
            skipped_validation += 1
            log_skip("missing_adruni", row)
            flush_logs_if_needed()
            continue

        place_name = get_any(row, PLACE_KEYS)
        street_name = get_any(row, STREET_NAME_KEYS)

        tokens = adruni_tokens(str(adruni_raw))

        terc = str(teryt).strip()
        terc = "".join([c for c in terc if c.isdigit()])
        if not terc:
            skipped += 1
            skipped_validation += 1
            log_skip("invalid_teryt_digits", row)
            flush_logs_if_needed()
            continue
        terc = terc.zfill(7)

        simc = None
        if len(tokens) >= 3:
            cand = tokens[2].strip()
            if cand.isdigit() and len(cand) == 7:
                simc = cand

        ulic = None
        if len(tokens) >= 5:
            cand = tokens[4].strip()
            if cand.isdigit() and len(cand) == 5 and cand != "00000":
                ulic = cand

        if not simc:
            simc = extract_first_by_len(tokens, 7)

        if ulic is None:
            for t in tokens[1:]:
                if len(t) == 5 and t.isdigit() and t != "00000":
                    ulic = t
                    break

        if not simc:
            skipped += 1
            skipped_validation += 1
            log_skip("missing_simc_in_adruni", row)
            flush_logs_if_needed()
            continue

        simc = str(simc).strip()
        ulic = str(ulic).strip() if ulic else None

        building_no = display_building_no(str(building_no_raw))
        building_no_norm = normalize_building_no(str(building_no_raw))

        row_id = stable_bigint_id(terc, simc, ulic or "", building_no_norm, str(adruni_raw))

        if rows_seen <= 5:
            svc._job_log(
                job.id,
                f"PROBE row={rows_seen} terc={terc} simc={simc} ulic={ulic} bnn={building_no_norm} bno={building_no} adruni={str(adruni_raw)[:80]}",
            )

        batch.append(
            {
                "id": row_id,
                "terc": terc,
                "simc": simc,
                "ulic": ulic,
                "place_name": str(place_name).strip() if place_name is not None else None,
                "street_name": str(street_name).strip() if street_name is not None else None,
                "building_no": building_no,
                "building_no_norm": building_no_norm,
                "adruni": str(adruni_raw),
            }
        )

        if len(batch) >= BATCH_SIZE:
            flush_batch()

        now = now_utc()
        if (now - last_progress_at).total_seconds() >= 0.5:
            last_progress_at = now
            flush_logs_if_needed()
            svc._job_update(
                job,
                stage="processing_rows",
                message="Przetwarzam ADRUNI…",
                meta_patch={
                    "rows_seen": rows_seen,
                    "inserted": inserted,
                    "updated": updated,
                    "skipped": skipped,
                    "skipped_validation": skipped_validation,
                    "skipped_conflict": skipped_conflict,
                    "skipped_logged": skipped_logged,
                    "skipped_reasons": dict(skip_reasons),
                },
            )

    flush_batch()
    flush_logs_if_needed(force=True)

    svc._job_update(
        job,
        stage="processing_rows",
        message="Przetwarzam ADRUNI…",
        meta_patch={
            "rows_seen": rows_seen,
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "skipped_validation": skipped_validation,
            "skipped_conflict": skipped_conflict,
            "skipped_logged": skipped_logged,
            "skipped_reasons": dict(skip_reasons),
        },
    )

    if log_skipped and skipped > skipped_logged:
        svc._job_log(
            job.id,
            f"[skip][adruni] UCIĘTO logowanie pominietych: logged={skipped_logged}/{skipped} (limit={log_limit}). "
            f"Ustaw PRG_LOG_SKIPPED_LIMIT wyżej, jeśli naprawdę chcesz więcej.",
            level="warn",
        )

    return inserted, updated, skipped, rows_seen


def upsert_official_points_with_progress(
    svc: Any,
    *,
    job: PrgJob,
    rows: Iterable[Dict[str, Any]],
    mode: str,
) -> Tuple[int, int, int, int]:
    inserted = 0
    updated = 0
    skipped = 0
    rows_seen = 0

    log_skipped, log_limit = svc._skip_logger_config()
    skipped_logged = 0
    skip_reasons: dict[str, int] = {}

    log_buf: list[str] = []
    last_log_flush = now_utc()

    def bump_reason(reason: str) -> None:
        skip_reasons[reason] = int(skip_reasons.get(reason, 0)) + 1

    def log_skip(reason: str, row: Dict[str, Any]) -> None:
        nonlocal skipped_logged, log_buf
        bump_reason(reason)
        if not log_skipped or skipped_logged >= log_limit:
            return
        pid = row.get("prg_point_id") or row.get("id") or row.get("auid")
        terc = row.get("terc") or row.get("teryt_gmina")
        simc = row.get("simc") or row.get("miejscowosc_simc")
        ulic = row.get("ulic") or row.get("ulica")
        bno = row.get("building_no") or row.get("numer") or row.get("nr_domu")
        lat = row.get("lat") or row.get("latitude")
        lon = row.get("lon") or row.get("lng") or row.get("longitude")
        x92 = row.get("x") or row.get("x_1992") or row.get("x_puwg1992")
        y92 = row.get("y") or row.get("y_1992") or row.get("y_puwg1992")
        line = (
            f"[skip][points] row={rows_seen} reason={reason} "
            f"id={pid!s} terc={terc!s} simc={simc!s} ulic={ulic!s} bno={bno!s} "
            f"lat={lat!s} lon={lon!s} x1992={x92!s} y1992={y92!s}"
        )
        log_buf.append(line)
        skipped_logged += 1

    def flush_logs_if_needed(force: bool = False) -> None:
        nonlocal log_buf, last_log_flush
        if not log_buf:
            return
        now = now_utc()
        if force or (now - last_log_flush).total_seconds() >= 0.5 or len(log_buf) >= 250:
            svc._job_log_bulk(job.id, log_buf, level="warn")
            log_buf = []
            last_log_flush = now

    use_full_deactivate = mode == "full"
    if use_full_deactivate:
        svc.db.execute(text("CREATE TEMP TABLE IF NOT EXISTS prg_stage_ids (prg_point_id text primary key) ON COMMIT DROP"))

    ID_KEYS = ["prg_point_id", "id", "idpunktu", "auid", "id_punktu", "id_adres"]
    TERC_KEYS = ["terc", "kod_terc", "teryt_gmina", "gmina_terc"]
    SIMC_KEYS = ["simc", "kod_simc", "miejscowosc_simc"]
    ULIC_KEYS = ["ulic", "kod_ulic", "ulica_ulic", "ulic_id", "ulica"]
    NO_STREET_KEYS = ["no_street", "bez_ulicy", "brak_ulicy"]

    BUILD_KEYS = ["building_no", "nr_domu", "numer_porzadkowy", "nrporz", "nr_budynku", "numer"]
    LOCAL_KEYS = ["local_no", "nr_lokalu", "lokal", "nr_lok", "nr_mieszkania"]

    LAT_KEYS = ["lat", "latitude"]
    LON_KEYS = ["lon", "lng", "longitude"]

    X92_KEYS = ["x", "x_1992", "x_puwg1992", "wsp_x", "x1992"]
    Y92_KEYS = ["y", "y_1992", "y_puwg1992", "wsp_y", "y1992"]

    NOTE_KEYS = ["note", "uwagi", "opis"]

    batch: list[dict[str, Any]] = []
    stage_batch: list[dict[str, Any]] = []
    exists_cache: dict[str, bool] = {}

    def refresh_exists_cache(keys: list[str]) -> None:
        if not keys:
            return
        existing = set(
            svc.db.execute(select(PrgAddressPoint.prg_point_id).where(PrgAddressPoint.prg_point_id.in_(keys)))
            .scalars()
            .all()
        )
        for k in keys:
            exists_cache[k] = k in existing

    def flush_batch() -> None:
        nonlocal batch, stage_batch
        if not batch:
            return

        stmt = insert(PrgAddressPoint).values(batch)
        update_cols = {
            "terc": stmt.excluded.terc,
            "simc": stmt.excluded.simc,
            "ulic": stmt.excluded.ulic,
            "no_street": stmt.excluded.no_street,
            "building_no": stmt.excluded.building_no,
            "building_no_norm": stmt.excluded.building_no_norm,
            "local_no": stmt.excluded.local_no,
            "local_no_norm": stmt.excluded.local_no_norm,
            "x_1992": stmt.excluded.x_1992,
            "y_1992": stmt.excluded.y_1992,
            "point": stmt.excluded.point,
            "note": stmt.excluded.note,
            "status": stmt.excluded.status,
            "updated_at": now_utc(),
        }
        stmt = stmt.on_conflict_do_update(index_elements=[PrgAddressPoint.prg_point_id], set_=update_cols)
        svc.db.execute(stmt)

        if use_full_deactivate and stage_batch:
            svc.db.execute(
                text("INSERT INTO prg_stage_ids (prg_point_id) VALUES (:prg_point_id) ON CONFLICT DO NOTHING"),
                stage_batch,
            )

        batch = []
        stage_batch = []
        svc.db.commit()

    last_progress_at = now_utc()
    chunk_keys: list[str] = []

    for row in rows:
        rows_seen += 1

        prg_point_id = get_any(row, ID_KEYS)
        if not prg_point_id:
            skipped += 1
            log_skip("missing_prg_point_id", row)
            flush_logs_if_needed()
            continue
        prg_point_id = str(prg_point_id).strip()

        terc = get_any(row, TERC_KEYS)
        simc = get_any(row, SIMC_KEYS)
        if not terc or not simc:
            skipped += 1
            log_skip("missing_terc_or_simc", row)
            flush_logs_if_needed()
            continue
        terc = str(terc).strip()
        simc = str(simc).strip()

        ulic = get_any(row, ULIC_KEYS)
        if ulic is not None:
            ulic = str(ulic).strip() or None

        no_street = is_truthy(get_any(row, NO_STREET_KEYS) or "0")

        building_no_raw = get_any(row, BUILD_KEYS)
        if not building_no_raw:
            skipped += 1
            log_skip("missing_building_no", row)
            flush_logs_if_needed()
            continue

        building_no = display_building_no(str(building_no_raw))
        building_no_norm = normalize_building_no(str(building_no_raw))

        local_no_raw = get_any(row, LOCAL_KEYS)
        local_no = display_local_no(str(local_no_raw)) if local_no_raw else None
        local_no_norm = normalize_local_no(str(local_no_raw)) if local_no_raw else None

        lat = get_any(row, ["lat", "latitude"])
        lon = get_any(row, ["lon", "lng", "longitude"])
        x92 = get_any(row, ["x", "x_1992", "x_puwg1992", "wsp_x", "x1992"])
        y92 = get_any(row, ["y", "y_1992", "y_puwg1992", "wsp_y", "y1992"])

        x_1992 = y_1992 = None
        if x92 is not None and y92 is not None:
            try:
                x_1992 = to_int(x92)
                y_1992 = to_int(y92)
            except Exception:
                x_1992 = y_1992 = None

        if lon is not None and lat is not None:
            try:
                lon_f = to_float(lon)
                lat_f = to_float(lat)
            except Exception:
                lon_f = lat_f = None
        else:
            lon_f = lat_f = None

        if (lon_f is None or lat_f is None) and x_1992 is not None and y_1992 is not None:
            try:
                lon_f, lat_f = puwg1992_to_wgs84(float(x_1992), float(y_1992))
            except Exception:
                lon_f = lat_f = None

        if lon_f is None or lat_f is None:
            skipped += 1
            log_skip("missing_coordinates", row)
            flush_logs_if_needed()
            continue

        note = get_any(row, NOTE_KEYS)
        note = str(note).strip() if note is not None else None

        row_doc = {
            "source": "PRG_OFFICIAL",
            "prg_point_id": prg_point_id,
            "local_point_id": None,
            "terc": terc,
            "simc": simc,
            "ulic": ulic,
            "no_street": bool(no_street),
            "building_no": building_no,
            "building_no_norm": building_no_norm,
            "local_no": local_no,
            "local_no_norm": local_no_norm,
            "x_1992": x_1992,
            "y_1992": y_1992,
            "point": (lon_f, lat_f),
            "note": note,
            "status": "active",
        }
        batch.append(row_doc)

        if use_full_deactivate:
            stage_batch.append({"prg_point_id": prg_point_id})

        if prg_point_id not in exists_cache:
            chunk_keys.append(prg_point_id)
            if len(chunk_keys) >= 5000:
                refresh_exists_cache(chunk_keys)
                chunk_keys = []

        if exists_cache.get(prg_point_id, False):
            updated += 1
        else:
            inserted += 1
            exists_cache[prg_point_id] = True

        if len(batch) >= 5000:
            flush_batch()

        now = now_utc()
        if (now - last_progress_at).total_seconds() >= 0.5:
            last_progress_at = now
            flush_logs_if_needed()
            svc._job_update(
                job,
                stage="processing_rows",
                message="Przetwarzam wiersze…",
                meta_patch={
                    "rows_seen": rows_seen,
                    "inserted": inserted,
                    "updated": updated,
                    "skipped": skipped,
                    "skipped_logged": skipped_logged,
                    "skipped_reasons": dict(skip_reasons),
                },
            )

    if chunk_keys:
        refresh_exists_cache(chunk_keys)

    flush_batch()
    flush_logs_if_needed(force=True)

    if use_full_deactivate:
        svc.db.execute(
            text(
                """
                UPDATE crm.prg_address_points p
                SET status='inactive', updated_at=now()
                WHERE p.source='PRG_OFFICIAL'
                  AND p.status='active'
                  AND p.prg_point_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM prg_stage_ids s WHERE s.prg_point_id=p.prg_point_id)
                """
            )
        )
        svc.db.commit()

    svc._job_update(
        job,
        stage="processing_rows",
        message="Przetwarzam wiersze…",
        meta_patch={
            "rows_seen": rows_seen,
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "skipped_logged": skipped_logged,
            "skipped_reasons": dict(skip_reasons),
        },
    )

    if log_skipped and skipped > skipped_logged:
        svc._job_log(
            job.id,
            f"[skip][points] UCIĘTO logowanie pominietych: logged={skipped_logged}/{skipped} (limit={log_limit}). "
            f"Ustaw PRG_LOG_SKIPPED_LIMIT wyżej, jeśli naprawdę chcesz więcej.",
            level="warn",
        )

    return inserted, updated, skipped, rows_seen
