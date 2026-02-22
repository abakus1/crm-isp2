from __future__ import annotations

import time
from typing import Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from crm.db.models.staff import ActivityLog
from crm.db.session import SessionLocal
from crm.shared.request_context import get_request_context
from crm.users.identity.jwt_deps import get_claims

from crm.core.activity_entity import extract_entity_from_request


_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Endpoints that are not "user button actions" (and often spammy).
_SKIP_PREFIXES = (
    "/identity/",
)

_SKIP_PATHS = {
    "/health",
}


def _try_get_staff_user_id(request: Request) -> Optional[int]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None

    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        claims = get_claims(token)  # validates token + kill-switch
        # we store staff user id in sub
        if str(claims.sub).isdigit():
            return int(claims.sub)
        return None
    except Exception:
        return None


class ActivityLogMiddleware(BaseHTTPMiddleware):
    """Logs mutating requests into crm.activity_log (best-effort, non-blocking)."""

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        method = (request.method or "").upper()
        if method not in _MUTATING_METHODS:
            return response

        path = request.url.path or "/"
        if path in _SKIP_PATHS:
            return response
        for pref in _SKIP_PREFIXES:
            if pref and path.startswith(pref):
                return response

        staff_user_id = _try_get_staff_user_id(request)
        entity_type, entity_id = extract_entity_from_request(request)

        ctx = get_request_context()
        meta = {
            "method": method,
            "path": path,
            "status_code": int(getattr(response, "status_code", 0) or 0),
            "duration_ms": duration_ms,
            "request_id": ctx.request_id,
            "ip": ctx.ip,
            "user_agent": (ctx.user_agent or "")[:300],
        }

        # Keep logs query-friendly
        action = f"{method} {path}"[:120]

        db = None
        try:
            db = SessionLocal()
            db.add(
                ActivityLog(
                    staff_user_id=staff_user_id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    meta=meta,
                )
            )
            db.commit()
        except Exception:
            try:
                if db:
                    db.rollback()
            except Exception:
                pass
        finally:
            try:
                if db:
                    db.close()
            except Exception:
                pass

        return response
