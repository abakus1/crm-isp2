#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request

import fcntl


# Kanoniczne ścieżki (zgodne z Twoim "na teraz")
IMPORTS_DIR = Path("/var/prg/imports")
STATE_DIR = Path("/var/prg/state")
LOCK_FILE = Path("/var/prg/locks/prg_fetch.lock")

# Docelowy URL do paczki PRG (tu wstawisz swój realny, jeżeli już jest w projekcie)
DEFAULT_URL = "https://example.invalid/PRG/POLSKA.zip"

# Bezpieczeństwo: jak długo lock może "wisieć" zanim uznamy, że ktoś się wysypał
DEFAULT_STALE_LOCK_SECONDS = 3 * 60 * 60  # 3h


@dataclass
class FetchResult:
    changed: bool
    filename: Optional[str]
    sha256: Optional[str]
    bytes_downloaded: int
    message: str


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_dirs() -> None:
    (IMPORTS_DIR).mkdir(parents=True, exist_ok=True)
    (STATE_DIR).mkdir(parents=True, exist_ok=True)
    (LOCK_FILE.parent).mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def atomic_move(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    shutil.move(str(src), str(tmp))
    os.replace(str(tmp), str(dst))


class SingleInstanceLock:
    """
    Lock na bazie fcntl.flock (działa między procesami).
    Dodatkowo zapisujemy PID i timestamp w pliku lock.
    """

    def __init__(self, lock_path: Path, stale_after_seconds: int):
        self.lock_path = lock_path
        self.stale_after_seconds = stale_after_seconds
        self.fp = None

    def acquire(self) -> None:
        ensure_dirs()
        self.fp = self.lock_path.open("a+", encoding="utf-8")
        try:
            fcntl.flock(self.fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # ktoś już trzyma lock
            self.fp.seek(0)
            data = self.fp.read().strip()
            # jeżeli lock "stary", to informacyjnie (nie brutalnie)
            msg = "Fetch PRG już działa (lock zajęty)."
            if data:
                msg += f" Lock meta: {data}"
            raise RuntimeError(msg)

        # mamy lock → zapisz meta
        self.fp.seek(0)
        self.fp.truncate(0)
        self.fp.write(f"pid={os.getpid()} started_at={_utc_now()}\n")
        self.fp.flush()

    def release(self) -> None:
        if not self.fp:
            return
        try:
            fcntl.flock(self.fp.fileno(), fcntl.LOCK_UN)
        finally:
            self.fp.close()
            self.fp = None


def download(url: str, out_path: Path, timeout: int = 300) -> int:
    req = Request(url, headers={"User-Agent": "crm-isp2-prg-fetch/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        n = 0
        with out_path.open("wb") as f:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                n += len(chunk)
        return n


def run_fetch(url: str) -> FetchResult:
    ensure_dirs()

    last_sha_path = STATE_DIR / "last.sha256"
    old_sha = last_sha_path.read_text(encoding="utf-8").strip() if last_sha_path.exists() else None

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    tmp_download = STATE_DIR / f"download_{ts}.zip"

    bytes_dl = download(url, tmp_download)

    new_sha = sha256_file(tmp_download)
    changed = (old_sha != new_sha)

    # zapisujemy sha zawsze (żeby był stan spójny)
    last_sha_path.write_text(new_sha + "\n", encoding="utf-8")

    filename = None
    if changed:
        filename = f"{ts}__POLSKA.zip"
        dest = IMPORTS_DIR / filename
        atomic_move(tmp_download, dest)
        msg = f"Pobrano nową paczkę PRG ({bytes_dl} B), sha256={new_sha[:12]}…, plik={filename}"
    else:
        # nic się nie zmieniło → usuń pobrany plik tymczasowy
        try:
            tmp_download.unlink(missing_ok=True)  # py3.12 ok
        except Exception:
            pass
        msg = f"Brak zmian w PRG (sha256 bez zmian), pobrano {bytes_dl} B testowo."

    return FetchResult(
        changed=changed,
        filename=filename,
        sha256=new_sha,
        bytes_downloaded=bytes_dl,
        message=msg,
    )


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--url", default=DEFAULT_URL, help="URL do paczki PRG (POLSKA.zip)")
    p.add_argument("--stale-lock-seconds", type=int, default=DEFAULT_STALE_LOCK_SECONDS)
    args = p.parse_args()

    lock = SingleInstanceLock(LOCK_FILE, stale_after_seconds=args.stale_lock_seconds)

    try:
        lock.acquire()
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 2

    try:
        res = run_fetch(args.url)
        print(res.message)
        return 0
    except Exception as e:
        print(f"Fetch PRG FAILED: {e}", file=sys.stderr)
        return 1
    finally:
        lock.release()


if __name__ == "__main__":
    raise SystemExit(main())
