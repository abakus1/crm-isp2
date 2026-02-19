from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Iterable, Dict, Any, Tuple
import uuid
import csv
import hashlib
import io
from pathlib import Path
import zipfile
import os
import tempfile
import fcntl
from urllib.request import Request, urlopen

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.session import SessionLocal
from crm.db.models.prg import (
    PrgDatasetState,
    PrgAddressPoint,
    PrgImportFile,
    PrgJob,
    PrgJobLog,
)
from crm.prg.utils.normalize import normalize_building_no, normalize_local_no
from crm.prg.services.reconcile_service import PrgReconcileService


class PrgError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _norm_key(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "_")


def _get_any(row: Dict[str, Any], keys: List[str]) -> Optional[Any]:
    for k in keys:
        if k in row:
            v = row.get(k)
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            return v
    return None


def _to_float(v: Any) -> float:
    return float(str(v).strip().replace(",", "."))


def _to_int(v: Any) -> int:
    return int(float(str(v).strip().replace(",", ".")))


def _is_truthy(v: Any) -> bool:
    s = str(v).strip().lower()
    return s in ("1", "true", "t", "yes", "y", "tak", "on")


def _puwg1992_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    try:
        from pyproj import Transformer  # type: ignore
    except Exception as e:
        raise PrgError(
            "Brak zależności 'pyproj' do konwersji PUWG1992 -> WGS84. "
            "Dodaj: pip install pyproj"
        ) from e

    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(x, y)
    return float(lon), float(lat)


class PrgService:
    DEFAULT_PRG_SOURCE_URL = "https://opendata.geoportal.gov.pl/prg/adresy/adruni/POLSKA.zip"

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # Jobs (live status)
    # -------------------------
    def _job_log(self, job_id: uuid.UUID, line: str, level: str = "info") -> None:
        self.db.add(PrgJobLog(job_id=job_id, level=level, line=line))
        self.db.flush()

    def _job_update(self, job: PrgJob, *, status: Optional[str] = None, stage: Optional[str] = None,
                    message: Optional[str] = None, meta_patch: Optional[dict[str, Any]] = None,
                    error: Optional[str] = None, finished: bool = False) -> None:
        if status is not None:
            job.status = status
        if stage is not None:
            job.stage = stage
        if message is not None:
            job.message = message
        if meta_patch:
            cur = dict(job.meta or {})
            cur.update(meta_patch)
            job.meta = cur
        if error is not None:
            job.error = error
        job.updated_at = _now()
        if finished:
            job.finished_at = _now()
        self.db.add(job)
        self.db.flush()

    def start_fetch_job(self, *, actor_staff_id: Optional[int]) -> PrgJob:
        # lock: nie pozwalamy odpalić kolejnego fetch, jeśli jest running
        running = self.db.execute(
            select(PrgJob).where(PrgJob.job_type == "fetch", PrgJob.status == "running").limit(1)
        ).scalar_one_or_none()
        if running:
            raise PrgError("Pobieranie PRG już trwa (job running).")

        job = PrgJob(
            job_type="fetch",
            status="running",
            stage="queued",
            message="Zlecono pobranie PRG.",
            meta={"actor_staff_id": actor_staff_id},
        )
        self.db.add(job)
        self.db.flush()
        return job

    def start_import_job(self, *, mode: str, actor_staff_id: Optional[int]) -> PrgJob:
        mode = (mode or "delta").strip().lower()
        if mode not in ("full", "delta"):
            raise PrgError("Nieprawidłowy tryb importu. Dozwolone: full|delta")

        running = self.db.execute(
            select(PrgJob).where(PrgJob.job_type == "import", PrgJob.status == "running").limit(1)
        ).scalar_one_or_none()
        if running:
            raise PrgError("Import PRG już trwa (job running).")

        job = PrgJob(
            job_type="import",
            status="running",
            stage="queued",
            message=f"Zlecono import PRG ({mode}).",
            meta={"mode": mode, "actor_staff_id": actor_staff_id},
        )
        self.db.add(job)
        self.db.flush()
        return job

    @staticmethod
    def run_fetch_job_background(job_id_str: str) -> None:
        job_id = uuid.UUID(job_id_str)
        db = SessionLocal()
        try:
            svc = PrgService(db)
            job = db.execute(select(PrgJob).where(PrgJob.id == job_id)).scalar_one()
            svc._run_fetch(job)
            db.commit()
        except Exception as e:
            try:
                job = db.execute(select(PrgJob).where(PrgJob.id == job_id)).scalar_one_or_none()
                if job:
                    job.status = "failed"
                    job.stage = job.stage or "failed"
                    job.error = str(e)
                    job.message = "Fetch PRG nie powiódł się."
                    job.finished_at = _now()
                    db.add(job)
                    db.flush()
                    db.add(PrgJobLog(job_id=job_id, level="error", line=str(e)))
                    db.commit()
            except Exception:
                db.rollback()
        finally:
            db.close()

    @staticmethod
    def run_import_job_background(job_id_str: str) -> None:
        job_id = uuid.UUID(job_id_str)
        db = SessionLocal()
        try:
            svc = PrgService(db)
            job = db.execute(select(PrgJob).where(PrgJob.id == job_id)).scalar_one()
            mode = (job.meta or {}).get("mode", "delta")
            svc._run_import(job, mode=mode)
            db.commit()
        except Exception as e:
            try:
                job = db.execute(select(PrgJob).where(PrgJob.id == job_id)).scalar_one_or_none()
                if job:
                    job.status = "failed"
                    job.stage = job.stage or "failed"
                    job.error = str(e)
                    job.message = "Import PRG nie powiódł się."
                    job.finished_at = _now()
                    db.add(job)
                    db.flush()
                    db.add(PrgJobLog(job_id=job_id, level="error", line=str(e)))
                    db.commit()
            except Exception:
                db.rollback()
        finally:
            db.close()

    # -------------------------
    # State + import dir
    # -------------------------
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
        now = _now()
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

    def ensure_import_dir(self) -> Path:
        settings = get_settings()
        p = Path(settings.prg_import_dir).expanduser()
        if not p.is_absolute():
            project_root = Path(__file__).resolve().parents[3]
            p = (project_root / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _prg_root_dir(self) -> Path:
        import_dir = self.ensure_import_dir()
        return import_dir.parent

    def _ensure_prg_dirs(self) -> tuple[Path, Path, Path]:
        root = self._prg_root_dir()
        state_dir = root / "state"
        locks_dir = root / "locks"
        state_dir.mkdir(parents=True, exist_ok=True)
        locks_dir.mkdir(parents=True, exist_ok=True)
        return root, state_dir, locks_dir

    def _acquire_lockfile(self, name: str) -> Any:
        _, _state, locks = self._ensure_prg_dirs()
        lock_path = locks / f"{name}.lock"
        fp = lock_path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fp.seek(0)
            meta = fp.read().strip()
            fp.close()
            raise PrgError(f"Proces już działa (lock: {name}). {meta}".strip())
        fp.seek(0)
        fp.truncate(0)
        fp.write(f"pid={os.getpid()} started_at={_now().isoformat(timespec='seconds')}\n")
        fp.flush()
        return fp

    def _release_lockfile(self, fp: Any) -> None:
        try:
            fcntl.flock(fp.fileno(), fcntl.LOCK_UN)
        finally:
            fp.close()

    # -------------------------
    # FETCH (python) + progress
    # -------------------------
    def _run_fetch(self, job: PrgJob) -> None:
        fp_lock = self._acquire_lockfile("prg_fetch")
        try:
            import_dir = self.ensure_import_dir()
            _, state_dir, _locks = self._ensure_prg_dirs()
            sha_path = state_dir / "last.sha256"

            source_url = (os.getenv("PRG_SOURCE_URL") or "").strip() or self.DEFAULT_PRG_SOURCE_URL
            old_sha = sha_path.read_text(encoding="utf-8").strip() if sha_path.exists() else None

            self._job_update(job, stage="downloading", message="Pobieram paczkę PRG…", meta_patch={"source_url": source_url})
            self._job_log(job.id, f"START fetch url={source_url}")

            ts = _now().strftime("%Y%m%dT%H%M%SZ")
            tmp_dir = Path(tempfile.mkdtemp(prefix="prg_fetch_", dir=str(state_dir)))
            tmp_zip = tmp_dir / f"POLSKA__{ts}.zip"

            req = Request(source_url, headers={"User-Agent": "crm-isp2-prg-fetch/1.0"})
            bytes_dl = 0
            total = None

            with urlopen(req, timeout=300) as resp:
                try:
                    total = int(resp.headers.get("Content-Length")) if resp.headers.get("Content-Length") else None
                except Exception:
                    total = None

                last_tick = _now()

                with tmp_zip.open("wb") as f:
                    while True:
                        chunk = resp.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        bytes_dl += len(chunk)

                        now = _now()
                        if (now - last_tick).total_seconds() >= 0.5:  # <-- live update co 0.5s
                            last_tick = now
                            self._job_update(
                                job,
                                stage="downloading",
                                message="Pobieram paczkę PRG…",
                                meta_patch={"bytes_downloaded": bytes_dl, "bytes_total": total},
                            )

            self._job_update(
                job,
                stage="downloading",
                message="Pobieranie zakończone. Kończę zapis…",
                meta_patch={"bytes_downloaded": bytes_dl, "bytes_total": total},
            )
            
            h = hashlib.sha256()
            with tmp_zip.open("rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(chunk)
            new_sha = h.hexdigest()

            sha_path.write_text(new_sha + "\n", encoding="utf-8")
            changed = (old_sha != new_sha)

            if changed:
                self._job_update(job, stage="saving", message="Zapis paczki do katalogu importu…", meta_patch={"sha256": new_sha, "changed": True})
                filename = f"{ts}__POLSKA.zip"
                dest = import_dir / filename

                tmp_dest = dest.with_suffix(dest.suffix + ".tmp")
                if tmp_dest.exists():
                    tmp_dest.unlink()
                tmp_zip.replace(tmp_dest)
                os.replace(str(tmp_dest), str(dest))

                # rejestrujemy plik jako pending do importu (żeby UI “widziało co dalej”)
                raw = dest.read_bytes()
                checksum = hashlib.sha256(raw).hexdigest()
                imp = self.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
                if not imp:
                    imp = PrgImportFile(
                        filename=dest.name,
                        size_bytes=dest.stat().st_size,
                        mode="delta",
                        status="pending",
                        checksum=checksum,
                    )
                    self.db.add(imp)
                    self.db.flush()

                self._job_log(job.id, f"SAVED file={filename} sha256={new_sha[:12]}… bytes={bytes_dl}")
                self._job_update(job, status="success", stage="done", finished=True,
                                 message=f"Pobrano nową paczkę PRG: {filename}",
                                 meta_patch={"filename": filename, "bytes_downloaded": bytes_dl, "bytes_total": total, "sha256": new_sha})
            else:
                self._job_log(job.id, f"NO CHANGE sha256={new_sha[:12]}… bytes={bytes_dl}")
                self._job_update(job, status="success", stage="done", finished=True,
                                 message="Brak zmian w PRG (checksum bez zmian).",
                                 meta_patch={"changed": False, "bytes_downloaded": bytes_dl, "bytes_total": total, "sha256": new_sha})

            # cleanup tmp
            try:
                for p in tmp_dir.iterdir():
                    p.unlink(missing_ok=True)
                tmp_dir.rmdir()
            except Exception:
                pass

        finally:
            self._release_lockfile(fp_lock)

    # -------------------------
    # IMPORT (stream ZIP) + progress
    # -------------------------
    def _run_import(self, job: PrgJob, *, mode: str) -> None:
        fp_lock = self._acquire_lockfile("prg_import")
        try:
            settings = get_settings()
            import_dir = self.ensure_import_dir()

            files = [p for p in import_dir.iterdir() if p.is_file() and p.suffix.lower() in (".zip", ".csv", ".tsv", ".txt")]
            if not files:
                self._job_update(job, status="skipped", stage="done", finished=True, message="Brak plików do importu w katalogu PRG.")
                return

            files.sort(key=lambda p: p.stat().st_mtime)
            path = files[0]

            self._job_update(job, stage="opening", message=f"Otwieram plik: {path.name}", meta_patch={"filename": path.name})

            # checksum pliku wejściowego (szybko: sha256 po bytes – tu OK, bo to ZIP/CSV, ale może być duże;
            # zostawiamy, bo i tak chcemy detekcję “już było”)
            raw = path.read_bytes()
            checksum = hashlib.sha256(raw).hexdigest()

            imp = self.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
            if not imp:
                imp = PrgImportFile(filename=path.name, size_bytes=len(raw), mode=mode, status="pending", checksum=checksum)
                self.db.add(imp)
                self.db.flush()

            if imp.status == "done":
                self._job_update(job, status="success", stage="done", finished=True, message="Plik już był zaimportowany (checksum).", meta_patch={"checksum": checksum})
                return

            imp.status = "processing"
            imp.mode = mode
            self.db.add(imp)
            self.db.flush()

            self._job_update(job, stage="reading_headers", message="Czytam nagłówki i wykrywam separator…")

            # STREAM: nie robimy read_bytes ZIP->RAM; czytamy z dysku
            rows_iter, total_hint = self._iter_rows_from_file_path(path)
            # total_hint może być None (ZIP nie daje total łatwo). UI i tak pokaże “rows_seen”.

            inserted = updated = skipped = rows_seen = 0
            self._job_update(job, stage="processing_rows", message="Przetwarzam wiersze…", meta_patch={
                "rows_seen": 0,
                "inserted": 0,
                "updated": 0,
                "skipped": 0,
                "rows_total_hint": total_hint,
            })
            self._job_log(job.id, "START import (stream)")

            inserted, updated, skipped, rows_seen = self._upsert_official_points_with_progress(
                job=job,
                rows=rows_iter,
                mode=mode,
            )

            imp.status = "done"
            imp.rows_inserted = inserted
            imp.rows_updated = updated
            imp.error = None
            imp.imported_at = _now()
            self.db.add(imp)

            st = self.mark_import(mode=mode, checksum=checksum)

            self._job_log(job.id, f"DONE import rows_seen={rows_seen} inserted={inserted} updated={updated} skipped={skipped}")
            self._job_update(job, stage="finalizing", message="Finalizuję i zapisuję wynik…", meta_patch={
                "rows_seen": rows_seen,
                "inserted": inserted,
                "updated": updated,
                "skipped": skipped,
                "checksum": checksum,
            })

            # reconcile auto
            if settings.prg_auto_reconcile:
                self._job_update(job, stage="reconcile", message="Uruchamiam reconcile…")
                stats = PrgReconcileService(self.db).run(
                    actor_staff_id=None,
                    job=True,
                    distance_m=settings.prg_reconcile_distance_m,
                )
                self._job_update(job, meta_patch={"reconcile": {
                    "matched": stats.matched,
                    "queued": stats.queued,
                    "scanned_pending": stats.scanned_pending,
                    "finished_at": stats.finished_at.isoformat(),
                }})

            if settings.prg_delete_file_after_import:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass

            self.db.flush()

            self._job_update(job, status="success", stage="done", finished=True, message="Import PRG zakończony ✅")
        finally:
            self._release_lockfile(fp_lock)

    def list_import_files(self, limit: int = 50) -> List[PrgImportFile]:
        return list(
            self.db.execute(select(PrgImportFile).order_by(PrgImportFile.created_at.desc()).limit(limit)).scalars()
        )

    def enqueue_file_from_upload(self, *, filename: str, content: bytes, mode: str) -> PrgImportFile:
        mode = (mode or "delta").strip().lower()
        if mode not in ("full", "delta"):
            raise PrgError("Nieprawidłowy tryb importu. Dozwolone: full|delta")

        import_dir = self.ensure_import_dir()
        safe_name = Path(filename).name
        ts = _now().strftime("%Y%m%dT%H%M%SZ")
        target = import_dir / f"{ts}__{safe_name}"
        target.write_bytes(content)

        checksum = hashlib.sha256(content).hexdigest()

        row = self.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
        if row:
            try:
                target.unlink(missing_ok=True)
            except Exception:
                pass
            return row

        imp = PrgImportFile(
            filename=str(target.name),
            size_bytes=len(content),
            mode=mode,
            status="pending",
            checksum=checksum,
        )
        self.db.add(imp)
        self.db.flush()
        return imp

    # -------------------------
    # STREAM reader (ZIP/CSV)
    # -------------------------
    def _iter_rows_from_file_path(self, path: Path) -> tuple[Iterable[Dict[str, Any]], Optional[int]]:
        """
        Streamuje wiersze z ZIP/CSV bez ładowania całości do RAM.
        total_hint: None (zwykle), zostawiamy.
        """
        suffix = path.suffix.lower()

        def gen_from_textio(text_io: io.TextIOBase, delimiter: str) -> Iterable[Dict[str, Any]]:
            reader = csv.DictReader(text_io, delimiter=delimiter)
            if not reader.fieldnames:
                raise PrgError("Plik PRG nie ma nagłówka.")
            for row in reader:
                out: Dict[str, Any] = {}
                for k, v in row.items():
                    out[_norm_key(k)] = v.strip() if isinstance(v, str) else v
                yield out

        def detect_delimiter(sample: str) -> str:
            delimiter = ";" if sample.count(";") >= sample.count(",") else ","
            if sample.count("\t") > max(sample.count(";"), sample.count(",")):
                delimiter = "\t"
            return delimiter

        if suffix == ".zip":
            zf = zipfile.ZipFile(path)
            names = [n for n in zf.namelist() if not n.endswith("/")]
            if not names:
                zf.close()
                raise PrgError("ZIP jest pusty.")
            cand = None
            for n in names:
                if Path(n).suffix.lower() in (".csv", ".tsv", ".txt"):
                    cand = n
                    break
            if not cand:
                cand = names[0]

            # robimy generator, który sam domknie zipa
            def rows() -> Iterable[Dict[str, Any]]:
                try:
                    with zf.open(cand) as bf:
                        txt = io.TextIOWrapper(bf, encoding="utf-8-sig", errors="replace")
                        head = txt.read(4096)
                        delim = detect_delimiter(head)
                        txt.seek(0)
                        yield from gen_from_textio(txt, delim)
                finally:
                    zf.close()

            return rows(), None

        # CSV/TSV/TXT
        def rows_plain() -> Iterable[Dict[str, Any]]:
            with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
                head = f.read(4096)
                delim = detect_delimiter(head)
                f.seek(0)
                yield from gen_from_textio(f, delim)

        return rows_plain(), None

    # -------------------------
    # UPSERT + progress
    # -------------------------
    def _upsert_official_points_with_progress(self, *, job: PrgJob, rows: Iterable[Dict[str, Any]], mode: str) -> Tuple[int, int, int, int]:
        inserted = 0
        updated = 0
        skipped = 0
        rows_seen = 0

        use_full_deactivate = mode == "full"
        if use_full_deactivate:
            self.db.execute(text("CREATE TEMP TABLE IF NOT EXISTS prg_stage_ids (prg_point_id text primary key) ON COMMIT DROP"))

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
                self.db.execute(select(PrgAddressPoint.prg_point_id).where(PrgAddressPoint.prg_point_id.in_(keys))).scalars().all()
            )
            for k in keys:
                exists_cache[k] = k in existing

        def flush_batch() -> None:
            nonlocal batch, stage_batch
            if not batch:
                return
            self._job_update(job, stage="upserting", message="Upsert batch do DB…")

            stmt = insert(PrgAddressPoint).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=[PrgAddressPoint.prg_point_id],
                set_={
                    "source": stmt.excluded.source,
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
                    "status": stmt.excluded.status,
                    "note": stmt.excluded.note,
                    "updated_at": text("now()"),
                },
            )
            self.db.execute(stmt)

            if use_full_deactivate and stage_batch:
                self.db.execute(
                    text("INSERT INTO prg_stage_ids (prg_point_id) VALUES (:prg_point_id) ON CONFLICT DO NOTHING"),
                    stage_batch,
                )
                stage_batch = []

            batch = []

        chunk_keys: list[str] = []
        last_progress_at = _now()

        for row in rows:
            rows_seen += 1

            prg_point_id = (_get_any(row, ID_KEYS) or "").strip()
            if not prg_point_id:
                skipped += 1
                continue

            chunk_keys.append(prg_point_id)
            if len(chunk_keys) >= 5000:
                refresh_exists_cache(chunk_keys)
                chunk_keys = []

            terc = (_get_any(row, TERC_KEYS) or "").strip()
            simc = (_get_any(row, SIMC_KEYS) or "").strip()
            if not terc or not simc:
                skipped += 1
                continue

            building_no = (_get_any(row, BUILD_KEYS) or "").strip()
            if not building_no:
                skipped += 1
                continue

            ulic = _get_any(row, ULIC_KEYS)
            ulic = ulic.strip() if isinstance(ulic, str) and ulic.strip() else None

            local_no = _get_any(row, LOCAL_KEYS)
            local_no = local_no.strip() if isinstance(local_no, str) and local_no.strip() else None

            no_street = _is_truthy(_get_any(row, NO_STREET_KEYS) or "")

            note = _get_any(row, NOTE_KEYS)
            note = note.strip() if isinstance(note, str) and note.strip() else None

            b_norm = normalize_building_no(building_no)
            l_norm = normalize_local_no(local_no)
            if not b_norm:
                skipped += 1
                continue

            if no_street:
                ulic = None

            lat_v = _get_any(row, LAT_KEYS)
            lon_v = _get_any(row, LON_KEYS)
            x_v = _get_any(row, X92_KEYS)
            y_v = _get_any(row, Y92_KEYS)

            x_1992: Optional[int] = None
            y_1992: Optional[int] = None

            try:
                if lat_v is not None and lon_v is not None:
                    lat = _to_float(lat_v)
                    lon = _to_float(lon_v)
                elif x_v is not None and y_v is not None:
                    x_1992 = _to_int(x_v)
                    y_1992 = _to_int(y_v)
                    lon, lat = _puwg1992_to_wgs84(float(x_1992), float(y_1992))
                else:
                    skipped += 1
                    continue
            except Exception:
                skipped += 1
                continue

            exists = exists_cache.get(prg_point_id)
            if exists is None:
                refresh_exists_cache([prg_point_id])
                exists = exists_cache.get(prg_point_id, False)

            if exists:
                updated += 1
            else:
                inserted += 1

            batch.append(
                {
                    "source": "PRG_OFFICIAL",
                    "prg_point_id": prg_point_id,
                    "local_point_id": None,
                    "terc": terc,
                    "simc": simc,
                    "ulic": ulic,
                    "no_street": bool(no_street),
                    "building_no": building_no,
                    "building_no_norm": b_norm,
                    "local_no": local_no,
                    "local_no_norm": l_norm,
                    "x_1992": x_1992,
                    "y_1992": y_1992,
                    "point": (float(lon), float(lat)),
                    "note": note,
                    "status": "active",
                }
            )

            if use_full_deactivate:
                stage_batch.append({"prg_point_id": prg_point_id})

            if len(batch) >= 2000:
                flush_batch()

            # progress co 10k wierszy albo co 1s
            now = _now()
            if rows_seen % 10000 == 0 or (now - last_progress_at).total_seconds() >= 1.0:
                last_progress_at = now
                self._job_update(job, stage="processing_rows", message="Przetwarzam wiersze…", meta_patch={
                    "rows_seen": rows_seen,
                    "inserted": inserted,
                    "updated": updated,
                    "skipped": skipped,
                })
                if rows_seen % 10000 == 0:
                    self._job_log(job.id, f"PROGRESS rows={rows_seen} ins={inserted} upd={updated} skip={skipped}")

        if chunk_keys:
            refresh_exists_cache(chunk_keys)

        flush_batch()

        if use_full_deactivate:
            self.db.execute(
                text(
                    """
                    UPDATE crm.prg_address_points p
                    SET status = 'inactive', updated_at = now()
                    WHERE p.source = 'PRG_OFFICIAL'
                      AND p.status = 'active'
                      AND p.prg_point_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM prg_stage_ids s WHERE s.prg_point_id = p.prg_point_id)
                    """
                )
            )

        return inserted, updated, skipped, rows_seen

    # ---- lokalne punkty pending ----
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
            x_1992=None,
            y_1992=None,
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
