from __future__ import annotations

from pathlib import Path
from typing import Any
import hashlib
import os
import tempfile
from urllib.request import Request, urlopen

from sqlalchemy import select

from crm.db.models.prg import PrgImportFile, PrgJob
from .prg_errors import PrgCancelled
from .prg_common import now_utc


def run_fetch(svc: Any, job: PrgJob) -> None:
    """Pobiera paczkę PRG do katalogu importu, zapisuje checksum i tworzy wpis PrgImportFile."""

    fp_lock, lock_path = svc._acquire_lockfile("prg_fetch")
    try:
        import_dir = svc.ensure_import_dir()
        _root, state_dir, _locks = svc._ensure_prg_dirs()
        sha_path = state_dir / "last.sha256"

        source_url = (os.getenv("PRG_SOURCE_URL") or "").strip() or svc.DEFAULT_PRG_SOURCE_URL
        old_sha = sha_path.read_text(encoding="utf-8").strip() if sha_path.exists() else None

        svc._job_update(job, stage="downloading", message="Pobieram paczkę PRG…", meta_patch={"source_url": source_url})
        svc._job_log(job.id, f"START fetch url={source_url}")

        ts = now_utc().strftime("%Y%m%dT%H%M%SZ")
        tmp_base = import_dir / ".tmp"
        tmp_base.mkdir(parents=True, exist_ok=True)
        tmp_dir = Path(tempfile.mkdtemp(prefix="prg_fetch_", dir=str(tmp_base)))
        tmp_zip = tmp_dir / f"POLSKA__{ts}.zip"

        req = Request(source_url, headers={"User-Agent": "crm-isp2-prg-fetch/1.0"})
        bytes_dl = 0
        total = None

        with urlopen(req, timeout=300) as resp:
            try:
                total = int(resp.headers.get("Content-Length")) if resp.headers.get("Content-Length") else None
            except Exception:
                total = None

            last_tick = now_utc()

            with tmp_zip.open("wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    bytes_dl += len(chunk)

                    # cancel support (sprawdzamy w DB, bo cancel przychodzi z innej sesji)
                    if svc.is_job_cancelled(job.id):
                        raise PrgCancelled("Fetch cancelled")

                    now = now_utc()
                    if (now - last_tick).total_seconds() >= 0.5:
                        last_tick = now
                        svc._job_update(
                            job,
                            stage="downloading",
                            message="Pobieram paczkę PRG…",
                            meta_patch={"bytes_downloaded": bytes_dl, "bytes_total": total},
                        )

        svc._job_update(
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
            svc._job_update(
                job,
                stage="saving",
                message="Zapis paczki do katalogu importu…",
                meta_patch={"sha256": new_sha, "changed": True},
            )
            filename = f"{ts}__POLSKA.zip"
            dest = import_dir / filename

            tmp_dest = dest.with_suffix(dest.suffix + ".tmp")
            if tmp_dest.exists():
                tmp_dest.unlink()
            tmp_zip.replace(tmp_dest)
            os.replace(str(tmp_dest), str(dest))

            raw = dest.read_bytes()
            checksum = hashlib.sha256(raw).hexdigest()
            imp = svc.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
            if not imp:
                imp = PrgImportFile(
                    filename=dest.name,
                    size_bytes=dest.stat().st_size,
                    mode="delta",
                    status="pending",
                    checksum=checksum,
                )
                svc.db.add(imp)
                svc.db.flush()

            svc._job_log(job.id, f"SAVED file={filename} sha256={new_sha[:12]}… bytes={bytes_dl}")
            size_mb = round(bytes_dl / (1024 * 1024), 1)
            svc._job_update(
                job,
                status="success",
                stage="done",
                finished=True,
                message=f"✅ Pobieranie PRG zakończone — zapisano {filename} ({size_mb} MB).",
                meta_patch={
                    "filename": filename,
                    "bytes_downloaded": bytes_dl,
                    "bytes_total": total,
                    "sha256": new_sha,
                    "changed": True,
                    "summary": f"Nowa paczka PRG: {filename} ({size_mb} MB), SHA {new_sha[:12]}…",
                },
            )
        else:
            svc._job_log(job.id, f"NO CHANGE sha256={new_sha[:12]}… bytes={bytes_dl}")
            size_mb = round(bytes_dl / (1024 * 1024), 1)
            svc._job_update(
                job,
                status="success",
                stage="done",
                finished=True,
                message="✅ Pobieranie PRG zakończone — brak zmian (checksum bez zmian).",
                meta_patch={
                    "changed": False,
                    "bytes_downloaded": bytes_dl,
                    "bytes_total": total,
                    "sha256": new_sha,
                    "summary": f"Brak zmian PRG (SHA {new_sha[:12]}…), pobrano {size_mb} MB",
                },
            )

        try:
            for p in tmp_dir.iterdir():
                p.unlink(missing_ok=True)
            tmp_dir.rmdir()
        except Exception:
            pass
    except PrgCancelled:
        # przerwane pobieranie: sprzątamy pliki tymczasowe i oznaczamy job jako cancelled
        try:
            svc._job_log(job.id, "CANCEL: przerwano pobieranie — sprzątam pliki tymczasowe", level="warn")
        except Exception:
            pass
        try:
            # usuwamy fragment pobranego pliku + katalog tmp
            if 'tmp_zip' in locals():
                try:
                    tmp_zip.unlink(missing_ok=True)
                except Exception:
                    pass
            if 'tmp_dir' in locals():
                try:
                    for p in tmp_dir.iterdir():
                        p.unlink(missing_ok=True)
                    tmp_dir.rmdir()
                except Exception:
                    pass
        finally:
            # lock i tak będzie zdjęty w finally
            pass

        svc._job_update(
            job,
            status="cancelled",
            stage="done",
            finished=True,
            message="⛔️ Pobieranie PRG przerwane.",
            meta_patch={"cancelled": True},
        )
    finally:
        svc._release_lockfile(fp_lock, lock_path)