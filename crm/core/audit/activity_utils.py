# crm/core/audit/activity_utils.py
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import Request


def safe_user_agent(request: Request, *, max_len: int = 200) -> Optional[str]:
    ua = request.headers.get("user-agent")
    if not ua:
        return None
    ua = ua.strip()
    if len(ua) <= max_len:
        return ua
    return ua[:max_len] + "…"


def build_activity_meta(
    *,
    request: Request,
    request_id: Optional[str],
    ip: Optional[str],
    user_agent: Optional[str],
    status_code: int,
    duration_ms: int,
) -> Dict[str, Any]:
    # Meta ma być “bezpieczne” (bez wrażliwych danych), i stabilne do debugowania.
    # Nie wrzucamy tu raw body. Query params też mogą zawierać sekrety, więc tylko klucze.
    endpoint = request.scope.get("endpoint")
    endpoint_name = getattr(endpoint, "__name__", None)

    return {
        "method": request.method,
        "path": str(request.url.path),
        "endpoint": endpoint_name,
        "status_code": status_code,
        "duration_ms": duration_ms,
        "request_id": request_id,
        "ip": ip,
        "user_agent": user_agent,
        "query_keys": sorted(list(request.query_params.keys())),
    }
