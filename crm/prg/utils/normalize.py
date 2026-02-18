from __future__ import annotations


def normalize_building_no(raw: str) -> str:
    """Normalizuje numer budynku tak, żeby nie powstało 12A/12 a/12-A/12a jako 4 budynki.

    Zasady (proste, ale skuteczne):
    - trim
    - upper
    - usuń spacje i myślniki
    """
    if raw is None:
        return ""
    s = str(raw).strip().upper()
    s = s.replace(" ", "").replace("-", "")
    return s


def normalize_local_no(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    s = s.replace(" ", "").replace("-", "")
    return s or None
