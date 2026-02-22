from __future__ import annotations

from typing import Any, Optional, Callable

from fastapi import Request


ENTITY_TYPE_ATTR = "activity_entity_type"
ENTITY_ID_ATTR = "activity_entity_id"


def set_activity_entity(request: Request, *, entity_type: str, entity_id: str | int) -> None:
    """Ustaw encję dla activity_log w obrębie jednego requestu.

    To jest kanoniczny mechanizm: endpoint/use-case wie co zmienia.
    Middleware tylko to odczytuje i zapisuje.
    """

    setattr(request.state, ENTITY_TYPE_ATTR, str(entity_type))
    setattr(request.state, ENTITY_ID_ATTR, str(entity_id))


def get_activity_entity(request: Request) -> tuple[Optional[str], Optional[str]]:
    return (
        getattr(request.state, ENTITY_TYPE_ATTR, None),
        getattr(request.state, ENTITY_ID_ATTR, None),
    )


def entity_from_path_param(entity_type: str, *, param_name: str = "id") -> Callable[[Request], None]:
    """Dependency: bierze request.path_params[param_name] i ustawia entity_*.

    Użycie:
        dependencies=[Depends(entity_from_path_param("staff_user", param_name="staff_id"))]
    """

    def _dep(request: Request) -> None:
        raw = request.path_params.get(param_name)
        if raw is None:
            return
        set_activity_entity(request, entity_type=entity_type, entity_id=str(raw))

    return _dep


def infer_entity_from_path(path: str) -> tuple[Optional[str], Optional[str]]:
    """Soft fallback: próbuje wywnioskować encję z URL.

    Nie zastępuje set_activity_entity() — to tylko awaryjny ratownik.
    """

    parts = [p for p in (path or "").split("/") if p]
    if not parts:
        return (None, None)

    # /staff/{id}/...
    if parts[0] == "staff" and len(parts) >= 2 and parts[1].isdigit():
        return ("staff_user", parts[1])

    # /prg/jobs/{id}/...
    if parts[0] == "prg" and len(parts) >= 3 and parts[1] == "jobs" and parts[2].isdigit():
        return ("prg_job", parts[2])

    # /prg/local-points/{id}
    if parts[0] == "prg" and len(parts) >= 3 and parts[1] in {"local-points", "points"} and parts[2].isdigit():
        return ("prg_address_point", parts[2])

    return (None, None)
