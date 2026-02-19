from __future__ import annotations


def normalize_building_no(raw: str, *, normalize: bool = True) -> str:
    """
    building_no (normalize=False)  -> czytelny zapis (trim + upper)
    building_no_norm (normalize=True) -> klucz porównawczy (bez spacji i myślników)
    """
    if raw is None:
        return ""
    s = str(raw).strip().upper()
    if normalize:
        s = s.replace(" ", "").replace("-", "")
    return s


def normalize_local_no(raw: str | None, *, normalize: bool = True) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if normalize:
        s = s.replace(" ", "").replace("-", "")
    return s or None
