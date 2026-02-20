from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Dict, Any, Iterable, Tuple
import uuid
from pathlib import Path
import os
import fcntl
import hashlib

from sqlalchemy import select, text, and_, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.session import SessionLocal
from crm.db.models.prg import (
    PrgDatasetState,
    PrgAddressPoint,
    PrgAdruniBuildingNumber,
    PrgImportFile,
    PrgJob,
    PrgJobLog,
    PrgReconcileQueue,
)
from crm.prg.utils.normalize import normalize_building_no, normalize_local_no
from crm.prg.services.reconcile_service import PrgReconcileService

from crm.prg.services.prg_errors import PrgError
from crm.prg.services.prg_common import (
    now_utc as _now,
    norm_key as _norm_key,
    get_any as _get_any,
    to_float as _to_float,
    to_int as _to_int,
    is_truthy as _is_truthy,
    puwg1992_to_wgs84 as _puwg1992_to_wgs84,
    adruni_tokens as _adruni_tokens,
    extract_first_by_len as _extract_first_by_len,
    display_building_no as _display_building_no,
    display_local_no as _display_local_no,
)

from crm.prg.services.prg_fetch import run_fetch
from crm.prg.services.prg_import import (
    run_import,
    upsert_adruni_building_numbers_with_progress,
    upsert_official_points_with_progress,
)
from crm.prg.services.prg_stream import iter_rows_from_file_path


class PrgService:
    DEFAULT_PRG_SOURCE_URL = "https://opendata.geoportal.gov.pl/prg/adresy/adruni/POLSKA.zip"

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # Jobs (live status)
    # -------------------------
    def _job_log(self, job_id: uuid.UUID, line: str, level: str = "info") -> None:
        # WAŻNE: commit, żeby inne sesje (polling z UI) widziały logi "na żywo".
        self.db.add(PrgJobLog(job_id=job_id, level=level, line=line))
        self.db.flush()
        self.db.commit()

    def _job_log_bulk(self, job_id: uuid.UUID, lines: list[str], level: str = "info") -> None:
        """
        Szybki log: zapisujemy wiele linii naraz, 1 commit.
        """
        if not lines:
            return
        self.db.add_all([PrgJobLog(job_id=job_id, level=level, line=line) for line in lines])
        self.db.flush()
        self.db.commit()

    def _job_update(
        self,
        job: PrgJob,
        *,
        status: Optional[str] = None,
        stage: Optional[str] = None,
        message: Optional[str] = None,
        meta_patch: Optional[dict[str, Any]] = None,
        error: Optional[str] = None,
        finished: bool = False,
    ) -> None:
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
        # commit, żeby UI (polling) widziało progres bez czekania na koniec joba
        self.db.commit()

    def assert_no_active_job(self) -> None:
        """Twarda blokada: PRG ma być singletonem — 1 job na raz (fetch/import/cancelling).

        Aktywny = status='running' lub (status='cancelled' i finished_at IS NULL).
        """
        active = self.db.execute(
            select(PrgJob)
            .where(
                or_(
                    PrgJob.status == "running",
                    and_(PrgJob.status == "cancelled", PrgJob.finished_at.is_(None)),
                )
            )
            .order_by(PrgJob.updated_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        if active:
            raise PrgError("Trwa inne zadanie PRG. Najpierw poczekaj albo użyj 'Przerwij'.")

    def is_job_cancelled(self, job_id: uuid.UUID) -> bool:
        """Sprawdza w DB, czy job został oznaczony jako cancelled (przez inną sesję / endpoint)."""
        status = self.db.execute(select(PrgJob.status).where(PrgJob.id == job_id)).scalar_one_or_none()
        return status == "cancelled"

    def cancel_active_job(self, *, actor_staff_id: Optional[int]) -> PrgJob:
        """Ustawia status='cancelled' dla aktywnego joba. Runner musi to respektować."""
        j = (
            self.db.execute(
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
            raise PrgError("Brak aktywnego joba do przerwania.")

        # już anulowany i trwa sprzątanie
        if j.status == "cancelled" and j.finished_at is None:
            return j

        self._job_update(
            j,
            status="cancelled",
            stage="cancelling",
            message="⛔️ Zlecono przerwanie joba — zatrzymuję…",
            meta_patch={"cancelled_by_staff_id": actor_staff_id},
        )
        self._job_log(j.id, f"CANCEL requested by staff_id={actor_staff_id}", level="warn")
        return j

    def start_fetch_job(self, *, actor_staff_id: Optional[int]) -> PrgJob:
        # Twarda blokada: nie pozwalamy uruchomić żadnego joba, jeśli inny jest aktywny.
        self.assert_no_active_job()

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

        # Twarda blokada: nie pozwalamy uruchomić żadnego joba, jeśli inny jest aktywny.
        self.assert_no_active_job()

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
        return self.ensure_import_dir()

    def _ensure_prg_dirs(self) -> tuple[Path, Path, Path]:
        root = self._prg_root_dir()
        state_dir = root
        locks_dir = root
        root.mkdir(parents=True, exist_ok=True)
        return root, state_dir, locks_dir

    def _acquire_lockfile(self, name: str) -> tuple[Any, Path]:
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
        return fp, lock_path

    def _release_lockfile(self, fp: Any, lock_path: Path) -> None:
        try:
            fcntl.flock(fp.fileno(), fcntl.LOCK_UN)
        finally:
            fp.close()
        try:
            lock_path.unlink(missing_ok=True)
        except Exception:
            pass

    # -------------------------
    # Debug logging of skipped rows
    # -------------------------
    def _skip_logger_config(self) -> tuple[bool, int]:
        """
        Logowanie 'pominietych' rekordów jest turbo przydatne do debugowania,
        ale w produkcji potrafi zabić DB (miliony logów).
        Sterowanie ENV:
          PRG_LOG_SKIPPED=1   -> włącz
          PRG_LOG_SKIPPED_LIMIT=2000 -> max logowanych linii na job (default 2000)
        """
        enabled = (os.getenv("PRG_LOG_SKIPPED") or "").strip().lower() in ("1", "true", "t", "yes", "y", "tak", "on")
        try:
            limit = int((os.getenv("PRG_LOG_SKIPPED_LIMIT") or "").strip() or "2000")
        except Exception:
            limit = 2000
        if limit < 0:
            limit = 0
        return enabled, limit

    # -------------------------
    # FETCH (python) + progress
    # -------------------------
    def _run_fetch(self, job: PrgJob) -> None:
        run_fetch(self, job)

    # -------------------------
    # IMPORT (stream ZIP) + progress
    # -------------------------
    def _run_import(self, job: PrgJob, *, mode: str) -> None:
        run_import(self, job, mode=mode)

    def list_import_files(self, limit: int = 50) -> List[PrgImportFile]:
        return list(self.db.execute(select(PrgImportFile).order_by(PrgImportFile.created_at.desc()).limit(limit)).scalars())

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

        imp = PrgImportFile(filename=str(target.name), size_bytes=len(content), mode=mode, status="pending", checksum=checksum)
        self.db.add(imp)
        self.db.flush()
        return imp

    # -------------------------
    # STREAM reader (ZIP/CSV)
    # -------------------------
    def _iter_rows_from_file_path(self, path: Path, job: Optional[PrgJob] = None) -> tuple[Iterable[Dict[str, Any]], Optional[int]]:
        return iter_rows_from_file_path(self, path, job=job)

    # -------------------------
    # ADRUNI importer (building numbers)
    # -------------------------
    def _upsert_adruni_building_numbers_with_progress(
        self,
        *,
        job: PrgJob,
        rows: Iterable[Dict[str, Any]],
        mode: str
    ) -> Tuple[int, int, int, int]:
        return upsert_adruni_building_numbers_with_progress(self, job=job, rows=rows, mode=mode)


    # -------------------------
    # UPSERT + progress (address points)
    # -------------------------
    def _upsert_official_points_with_progress(self, *, job: PrgJob, rows: Iterable[Dict[str, Any]], mode: str) -> Tuple[int, int, int, int]:
        return upsert_official_points_with_progress(self, job=job, rows=rows, mode=mode)

    # -------------------------
    # Local points (manual) + reconcile queue
    # -------------------------
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
        building_no_norm = normalize_building_no(building_no)
        local_no_norm = normalize_local_no(local_no) if local_no else None

        p = PrgAddressPoint(
            source="PRG_LOCAL_PENDING",
            prg_point_id=None,
            local_point_id=str(uuid.uuid4()),
            terc=terc.strip(),
            simc=simc.strip(),
            ulic=ulic.strip() if ulic else None,
            no_street=bool(no_street),
            building_no=_display_building_no(building_no),
            building_no_norm=building_no_norm,
            local_no=_display_local_no(local_no) if local_no else None,
            local_no_norm=local_no_norm,
            x_1992=None,
            y_1992=None,
            point=(float(lon), float(lat)),
            note=note.strip() if note else None,
            status="active",
        )
        self.db.add(p)
        self.db.flush()

        # enqueue reconcile
        self.db.add(PrgReconcileQueue(local_point_id=p.id, status="pending", candidates=[]))
        self.db.flush()
        self.db.commit()
        return p