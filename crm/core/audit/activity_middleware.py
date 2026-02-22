# crm/core/audit/activity_middleware.py
from __future__ import annotations

import time
from typing import Optional

from fastapi import Request
from starlette.responses import Response

from crm.db.session import SessionLocal
from crm.db.models.staff import ActivityLog
from crm.shared.request_context import get_request_context

# Logujemy wszystko co jest “kliknięciem” w UI:
# - POST / PUT / PATCH / DELETE
# (GET zostawiamy w spokoju, bo to zwykle “oglądanie”.)
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}

# Ścieżki, które NIE powinny generować activity (żeby nie spamować):
# - health check
_SKIP_PREFIXES = ("/health",)


def _try_get_staff_user_id(request: Request) -> Optional[int]:
    # Token jest już walidowany przez private_by_default middleware, ale:
    # - identity endpoints mogą być wywołane bez tokena,
    # - czasem lecimy po 401.
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    if not token:
        return None

    # Lokalny import, żeby uniknąć cykli przy starcie
    from crm.users.identity.jwt_deps import get_claims

    try:
        claims = get_claims(token)
        return int(claims.sub)
    except Exception:
        return None


def should_log_activity(request: Request) -> bool:
    if request.method not in _MUTATING:
        return False
    path = request.url.path or "/"
    if path.startswith(_SKIP_PREFIXES):
        return False
    return True


async def activity_log_middleware(request: Request, call_next) -> Response:
    if not should_log_activity(request):
        return await call_next(request)

    t0 = time.perf_counter()
    response: Response
    try:
        response = await call_next(request)
    except Exception:
        # Nawet jak wybuchło, to też jest “zdarzenie”.
        # Nie podmieniamy błędu — tylko logujemy.
        duration_ms = int((time.perf_counter() - t0) * 1000)
        _write_activity(request, status_code=500, duration_ms=duration_ms)
        raise

    duration_ms = int((time.perf_counter() - t0) * 1000)
    _write_activity(request, status_code=response.status_code, duration_ms=duration_ms)
    return response


def _write_activity(request: Request, *, status_code: int, duration_ms: int) -> None:
    from crm.core.audit.activity_utils import build_activity_meta, safe_user_agent

    ctx = get_request_context()
    ip = ctx.ip
    request_id = ctx.request_id
    ua = safe_user_agent(request)

    staff_user_id = _try_get_staff_user_id(request)

    # Akcja: prosto i przewidywalnie.
    # Przy analizie logów chcesz grepować po ścieżce, więc trzymamy “METHOD /path”.
    action = f"{request.method} {request.url.path}"

    meta = build_activity_meta(
        request=request,
        request_id=request_id,
        ip=ip,
        user_agent=ua,
        status_code=status_code,
        duration_ms=duration_ms,
    )

    db = SessionLocal()
    try:
        db.add(
            ActivityLog(
                staff_user_id=staff_user_id,
                action=action,
                entity_type=None,
                entity_id=None,
                message=None,
                meta=meta,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        # Logi nie mogą zatrzymać systemu.
        # (W prod warto to wysłać do Sentry/STDERR, ale tu trzymamy ciszę.)
    finally:
        db.close()
