from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import hashlib

from .prg_errors import PrgError


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def norm_key(s: str) -> str:
    return (s or "").strip().lower().replace(" ", "_")


def get_any(row: Dict[str, Any], keys: List[str]) -> Optional[Any]:
    for k in keys:
        if k in row:
            v = row.get(k)
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            return v
    return None


def to_float(v: Any) -> float:
    return float(str(v).strip().replace(",", "."))


def to_int(v: Any) -> int:
    return int(float(str(v).strip().replace(",", ".")))


def is_truthy(v: Any) -> bool:
    s = str(v).strip().lower()
    return s in ("1", "true", "t", "yes", "y", "tak", "on")


def puwg1992_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    try:
        from pyproj import Transformer  # type: ignore
    except Exception as e:
        raise PrgError(
            "Brak zależności 'pyproj' do konwersji PUWG1992 -> WGS84. Dodaj: pip install pyproj"
        ) from e

    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(x, y)
    return float(lon), float(lat)


def adruni_tokens(v: str) -> list[str]:
    # ADRUNI ma format pipe-delimited z trailing pipe
    if not v:
        return []
    parts = [p.strip() for p in str(v).split("|")]
    return [p for p in parts if p != ""]


def extract_first_by_len(tokens: list[str], n: int) -> Optional[str]:
    for t in tokens:
        if len(t) == n and t.isdigit():
            return t
    return None


def display_building_no(raw: str) -> str:
    return (raw or "").strip().upper()


def display_local_no(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    return s or None


def stable_bigint_id(*parts: str) -> int:
    """Deterministyczny bigint (60-bit-ish) z SHA1."""

    h = hashlib.sha1("|".join(parts).encode("utf-8", errors="ignore")).hexdigest()
    return int(h[:15], 16)
