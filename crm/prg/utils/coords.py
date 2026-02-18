from __future__ import annotations

from typing import Tuple

def puwg1992_to_wgs84(x: float, y: float) -> Tuple[float, float]:
    """
    EPSG:2180 (PUWG 1992) -> EPSG:4326 (lon, lat)
    Wymaga pyproj. Jeśli go nie ma, rzucamy czytelny błąd.
    """
    try:
        from pyproj import Transformer  # type: ignore
    except Exception as e:
        raise RuntimeError(
            "Brak zależności 'pyproj'. Zainstaluj: pip install pyproj "
            "albo dodaj do requirements. Bez tego nie da się konwertować PUWG1992 -> WGS84."
        ) from e

    transformer = Transformer.from_crs("EPSG:2180", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(x, y)
    return float(lon), float(lat)
