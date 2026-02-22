from __future__ import annotations

import time
from typing import Any, Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from crm.db.session import SessionLocal
from crm.db.models.staff import ActivityLog
from crm.shared.request_context import get_request_context
from crm.users.identity.jwt_deps import get_claims

from crm.core.audit.activity_context import get_activity_entity, infer_entity_from_path


_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Nie logujemy tych ścieżek (szczególnie /identity — hasła/MFA)
_SKIP_PREFIXES = (
    "/health",
    "/identity/",
)


def _safe_trunc(s: Optional[str], limit: int) -> Optional[str]:
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= limit else (s[: limit - 3] + "...")


def _extract_staff_user_id(request: Request) -> Optional[int]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        claims = get_claims(token)
        # u nas 'sub' trzyma staff_user_id (int)
        return int(claims.sub)
    except Exception:
        return None


class ActivityLogMiddleware(BaseHTTPMiddleware):
    """Automatyczne logowanie operacji (klików) do crm.activity_log.

    Kontrakt:
    - logujemy wszystkie mutujące requesty (POST/PUT/PATCH/DELETE)
    - entity_type/entity_id bierzemy z request.state (set_activity_entity)
      a jeśli brak — próbujemy awaryjnie z URL
    - best-effort: błąd zapisu logu NIE blokuje odpowiedzi
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path or "/"

        if request.method.upper() not in _MUTATING_METHODS:
            return await call_next(request)

        for pref in _SKIP_PREFIXES:
            if path.startswith(pref):
                return await call_next(request)

        started = time.perf_counter()
        response = None
        try:
            response = await call_next(request)
            return response
        finally:
            duration_ms = int((time.perf_counter() - started) * 1000)

            # Zbieramy meta z contextvar (ustawione w request_context_mw)
            ctx = get_request_context()

            entity_type, entity_id = get_activity_entity(request)
            if not entity_type or not entity_id:
                et, eid = infer_entity_from_path(path)
                entity_type = entity_type or et
                entity_id = entity_id or eid

            meta: dict[str, Any] = {
                "method": request.method.upper(),
                "path": path,
                "status_code": getattr(response, "status_code", None),
                "duration_ms": duration_ms,
                "request_id": ctx.request_id,
                "ip": ctx.ip,
                "user_agent": _safe_trunc(ctx.user_agent, 300),
            }

            # Query keys są ok, ale nie wartości
            if request.query_params:
                meta["query_keys"] = list(request.query_params.keys())

            staff_user_id = _extract_staff_user_id(request)

            # Zapis do DB (best-effort)
            try:
                db = SessionLocal()
                try:
                    row = ActivityLog(
                        staff_user_id=staff_user_id,
                        action=f"{request.method.upper()} {path}",
                        entity_type=entity_type,
                        entity_id=entity_id,
                        message=None,
                        meta=meta,
                    )
                    db.add(row)
                    db.commit()
                finally:
                    db.close()
            except Exception:
                # Nie blokujemy requestu przez logowanie
                pass
