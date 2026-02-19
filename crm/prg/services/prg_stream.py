from __future__ import annotations

from typing import Any, Dict, Iterable, Optional, Tuple
import csv
import io
from pathlib import Path
import zipfile

from crm.db.models.prg import PrgJob
from .prg_common import norm_key
from .prg_errors import PrgError


def iter_rows_from_file_path(
    svc: Any,
    path: Path,
    *,
    job: Optional[PrgJob] = None,
) -> Tuple[Iterable[Dict[str, Any]], Optional[int]]:
    """Streamuje wiersze z ZIP/CSV bez ładowania całości do RAM.

    Dla ZIP: sample w pierwszym open, potem reopen do DictReader (bez seek).
    Zwraca (iterator, total_hint). Total_hint zwykle None (brak taniego liczenia).

    svc: instancja PrgService (tylko do logowania, bez twardego importu żeby uniknąć cykli).
    """

    suffix = path.suffix.lower()

    def gen_from_textio(text_io: io.TextIOBase, delimiter: str) -> Iterable[Dict[str, Any]]:
        reader = csv.DictReader(text_io, delimiter=delimiter)
        if not reader.fieldnames:
            raise PrgError("Plik PRG nie ma nagłówka.")
        if job is not None:
            svc._job_log(job.id, f"HEADERS({len(reader.fieldnames)}): {reader.fieldnames[:25]}")
        for row in reader:
            out: Dict[str, Any] = {}
            for k, v in row.items():
                out[norm_key(k)] = v.strip() if isinstance(v, str) else v
            yield out

    def detect_delimiter(sample: str) -> str:
        semi = sample.count(";")
        comma = sample.count(",")
        tab = sample.count("\t")
        if tab > max(semi, comma):
            return "\t"
        return ";" if semi >= comma else ","

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

        with zf.open(cand) as bf:
            txt = io.TextIOWrapper(bf, encoding="utf-8-sig", errors="replace", newline="")
            head = txt.read(4096)
        delim = detect_delimiter(head)
        if job is not None:
            svc._job_log(job.id, f"DETECT zip_entry={cand} delimiter={repr(delim)} sample_len={len(head)}")

        def rows() -> Iterable[Dict[str, Any]]:
            try:
                with zf.open(cand) as bf2:
                    txt2 = io.TextIOWrapper(bf2, encoding="utf-8-sig", errors="replace", newline="")
                    yield from gen_from_textio(txt2, delim)
            finally:
                zf.close()

        return rows(), None

    def rows_plain() -> Iterable[Dict[str, Any]]:
        with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as f:
            head = f.read(4096)
            delim = detect_delimiter(head)
            f.seek(0)
            if job is not None:
                svc._job_log(job.id, f"DETECT file delimiter={repr(delim)}")
            yield from gen_from_textio(f, delim)

    return rows_plain(), None
