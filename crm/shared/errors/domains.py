from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DomainError(Exception):
    """Bazowy błąd domenowy (do użycia w services/use-cases).

    Na razie nie wpinamy go w globalny exception handler — to przyjdzie przy API hardening.
    """

    message: str
    code: str = "domain_error"
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(frozen=True)
class ValidationError(DomainError):
    code: str = "validation_error"
