from __future__ import annotations


class PrgError(RuntimeError):
    """Błędy domenowe modułu PRG."""

    pass


class PrgCancelled(PrgError):
    """Czyste przerwanie joba (cancel) — bez oznaczania jako failed."""

    pass