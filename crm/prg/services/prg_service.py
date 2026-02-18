from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List, Iterable, Dict, Any, Tuple
import uuid
import csv
import hashlib
import io
from pathlib import Path
import zipfile

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.models.prg import PrgDatasetState, PrgAddressPoint, PrgImportFile
from crm.prg.utils.normalize import normalize_building_no, normalize_local_no
from crm.prg.services.reconcile_service import PrgReconcileService


class PrgError(RuntimeError):
    pass


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
    """
    EPSG:2180 (PUWG 1992) -> EPSG:4326 (lon, lat)
    """
    try:
        from pyproj import Transformer  # type: ignore
    except Exception as e:
        raise PrgError(
            "Brak zależności 'pyproj' do konwersji PUWG1992 -> WGS84. "
            "Dodaj do zależności: pip install pyproj"
        ) from e

    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(x, y)
    return float(lon), float(lat)


class PrgService:
    def __init__(self, db: Session):
        self.db = db

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
        now = datetime.now(timezone.utc)
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

    # -------------------------
    # Import realny (file-based)
    # -------------------------
    def ensure_import_dir(self) -> Path:
        settings = get_settings()
        p = Path(settings.prg_import_dir).expanduser()
        if not p.is_absolute():
            project_root = Path(__file__).resolve().parents[3]
            p = (project_root / p).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

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
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
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

    def run_next_import_from_dir(self, *, mode: str) -> Tuple[PrgDatasetState, Optional[PrgImportFile], Dict[str, Any]]:
        mode = (mode or "delta").strip().lower()
        if mode not in ("full", "delta"):
            raise PrgError("Nieprawidłowy tryb importu. Dozwolone: full|delta")

        settings = get_settings()
        import_dir = self.ensure_import_dir()

        files = [
            p for p in import_dir.iterdir()
            if p.is_file() and p.suffix.lower() in (".zip", ".csv", ".tsv", ".txt")
        ]
        if not files:
            st = self.get_state()
            return st, None, {"message": "Brak plików do importu w katalogu PRG."}

        files.sort(key=lambda p: p.stat().st_mtime)
        path = files[0]
        raw = path.read_bytes()
        checksum = hashlib.sha256(raw).hexdigest()

        imp = self.db.execute(select(PrgImportFile).where(PrgImportFile.checksum == checksum)).scalar_one_or_none()
        if not imp:
            imp = PrgImportFile(
                filename=str(path.name),
                size_bytes=len(raw),
                mode=mode,
                status="pending",
                checksum=checksum,
            )
            self.db.add(imp)
            self.db.flush()

        if imp.status == "done":
            if settings.prg_delete_file_after_import:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass
            st = self.mark_import(mode=mode, checksum=checksum)
            return st, imp, {"message": "Plik już był zaimportowany (checksum)."}

        imp.status = "processing"
        imp.mode = mode
        self.db.add(imp)
        self.db.flush()

        inserted, updated = 0, 0
        try:
            rows_iter = self._iter_rows_from_file_bytes(filename=path.name, raw=raw)
            inserted, updated = self._upsert_official_points(rows_iter, mode=mode)

            imp.status = "done"
            imp.rows_inserted = inserted
            imp.rows_updated = updated
            imp.error = None
            imp.imported_at = datetime.now(timezone.utc)
            self.db.add(imp)

            st = self.mark_import(mode=mode, checksum=checksum)

            reconcile_stats: Dict[str, Any] = {}
            if settings.prg_auto_reconcile:
                stats = PrgReconcileService(self.db).run(
                    actor_staff_id=None,
                    job=True,
                    distance_m=settings.prg_reconcile_distance_m,
                )
                reconcile_stats = {
                    "reconcile": {
                        "matched": stats.matched,
                        "queued": stats.queued,
                        "scanned_pending": stats.scanned_pending,
                        "finished_at": stats.finished_at,
                    }
                }

            if settings.prg_delete_file_after_import:
                try:
                    path.unlink(missing_ok=True)
                except Exception:
                    pass

            self.db.flush()
            return st, imp, {"inserted": inserted, "updated": updated, **reconcile_stats}

        except Exception as e:
            imp.status = "failed"
            imp.error = str(e)
            self.db.add(imp)
            self.db.flush()
            raise

    def _iter_rows_from_file_bytes(self, *, filename: str, raw: bytes) -> Iterable[Dict[str, Any]]:
        """
        Obsługuje:
        - ZIP z plikiem CSV/TSV/TXT w środku (np. PRG “Adres Uniwersalny”)
        - CSV/TSV/TXT

        Zwraca wiersze jako dict z kluczami znormalizowanymi:
        lower + spacje->underscore

        Nie wymuszamy konkretnego schematu nagłówków — mapowanie robi _upsert_official_points().
        """
        def to_text(b: bytes) -> str:
            return b.decode("utf-8-sig", errors="replace")

        if filename.lower().endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                names = [n for n in zf.namelist() if not n.endswith("/")]
                if not names:
                    raise PrgError("ZIP jest pusty.")
                cand = None
                for n in names:
                    if Path(n).suffix.lower() in (".csv", ".tsv", ".txt"):
                        cand = n
                        break
                if not cand:
                    cand = names[0]
                text_data = to_text(zf.read(cand))
        else:
            text_data = to_text(raw)

        sample = text_data[:4096]
        delimiter = ";" if sample.count(";") >= sample.count(",") else ","
        if sample.count("\t") > max(sample.count(";"), sample.count(",")):
            delimiter = "\t"

        reader = csv.DictReader(io.StringIO(text_data), delimiter=delimiter)
        if not reader.fieldnames:
            raise PrgError("Plik PRG nie ma nagłówka.")

        for row in reader:
            out: Dict[str, Any] = {}
            for k, v in row.items():
                out[_norm_key(k)] = v.strip() if isinstance(v, str) else v
            yield out

    def _upsert_official_points(self, rows: Iterable[Dict[str, Any]], *, mode: str) -> Tuple[int, int]:
        """
        Upsert PRG_OFFICIAL po prg_point_id.
        Obsługuje zarówno:
        - WGS84: lat/lon
        - PUWG1992 (EPSG:2180): x/y -> konwersja do lon/lat

        W DB zapisujemy:
        - x_1992/y_1992 jeśli źródło ma x/y
        - point zawsze jako (lon,lat)
        """
        inserted = 0
        updated = 0

        use_full_deactivate = mode == "full"
        if use_full_deactivate:
            self.db.execute(
                text("CREATE TEMP TABLE IF NOT EXISTS prg_stage_ids (prg_point_id text primary key) ON COMMIT DROP")
            )

        # możliwe nazwy kolumn (znormalizowane)
        ID_KEYS = ["prg_point_id", "id", "idpunktu", "auid", "id_punktu", "id_adres"]
        TERC_KEYS = ["terc", "kod_terc", "teryt_gmina", "gmina_terc"]
        SIMC_KEYS = ["simc", "kod_simc", "miejscowosc_simc"]
        ULIC_KEYS = ["ulic", "kod_ulic", "ulica_ulic", "ulic_id", "ulica"]
        NO_STREET_KEYS = ["no_street", "bez_ulicy", "brak_ulicy"]

        BUILD_KEYS = ["building_no", "nr_domu", "numer_porzadkowy", "nrporz", "nr_budynku", "numer"]
        LOCAL_KEYS = ["local_no", "nr_lokalu", "lokal", "nr_lok", "nr_mieszkania"]

        # WGS84
        LAT_KEYS = ["lat", "latitude"]
        LON_KEYS = ["lon", "lng", "longitude"]

        # PUWG1992 (EPSG:2180) — PRG “Adres Uniwersalny”
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
                self.db.execute(
                    select(PrgAddressPoint.prg_point_id).where(PrgAddressPoint.prg_point_id.in_(keys))
                ).scalars().all()
            )
            for k in keys:
                exists_cache[k] = k in existing

        def flush_batch() -> None:
            nonlocal batch, stage_batch
            if not batch:
                return

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

        for row in rows:
            prg_point_id = (_get_any(row, ID_KEYS) or "").strip()
            if not prg_point_id:
                continue

            chunk_keys.append(prg_point_id)
            if len(chunk_keys) >= 5000:
                refresh_exists_cache(chunk_keys)
                chunk_keys = []

            terc = (_get_any(row, TERC_KEYS) or "").strip()
            simc = (_get_any(row, SIMC_KEYS) or "").strip()
            if not terc or not simc:
                continue

            building_no = (_get_any(row, BUILD_KEYS) or "").strip()
            if not building_no:
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
                continue

            if no_street:
                ulic = None

            # --- współrzędne ---
            lat_v = _get_any(row, LAT_KEYS)
            lon_v = _get_any(row, LON_KEYS)

            x_v = _get_any(row, X92_KEYS)
            y_v = _get_any(row, Y92_KEYS)

            x_1992: Optional[int] = None
            y_1992: Optional[int] = None

            if lat_v is not None and lon_v is not None:
                lat = _to_float(lat_v)
                lon = _to_float(lon_v)
            elif x_v is not None and y_v is not None:
                x_1992 = _to_int(x_v)
                y_1992 = _to_int(y_v)
                lon, lat = _puwg1992_to_wgs84(float(x_1992), float(y_1992))
            else:
                # bez współrzędnych punkt nie ma sensu
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
                    "point": (float(lon), float(lat)),  # (lon,lat)
                    "note": note,
                    "status": "active",
                }
            )

            if use_full_deactivate:
                stage_batch.append({"prg_point_id": prg_point_id})

            if len(batch) >= 2000:
                flush_batch()

        # UWAGA: dobijamy cache dla ostatniego chunka zanim kończymy (ważne przy inserted/updated)
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

        return inserted, updated

    # ---- lokalne punkty pending zostawiamy bez zmian ----
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
