# crm/app/main.py
from __future__ import annotations

import ipaddress
from typing import List, Optional

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse

from crm.shared.request_context import set_request_context

from crm.users.module import register as register_users
from crm.prg.module import register as register_prg

from crm.app.config import get_settings
from crm.users.identity.jwt_deps import get_claims

settings = get_settings()

PUBLIC_PATHS = {
    "/health",
    "/identity/login",
}

# Swagger w produkcji najlepiej wyłączyć / trzymać za VPN
PUBLIC_PREFIXES = (
    # "/docs",
    # "/openapi.json",
    # "/redoc",
)


def _deny_unauth() -> JSONResponse:
    # Stealth: jedna odpowiedź na wszystko, bez zdradzania czy to IP-block, brak tokena, itp.
    return JSONResponse({"detail": "Brak autoryzacji."}, status_code=401)


def _parse_allowed_nets(raw: str) -> List[ipaddress._BaseNetwork]:
    nets: List[ipaddress._BaseNetwork] = []
    for part in (raw or "").split(","):
        p = part.strip()
        if not p:
            continue
        try:
            nets.append(ipaddress.ip_network(p, strict=False))
        except Exception:
            continue
    return nets


def _client_ip(request: Request) -> Optional[str]:
    # Reverse-proxy aware (nginx): X-Forwarded-For: client, proxy1, proxy2...
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def create_app() -> FastAPI:
    app = FastAPI(title="CRM ISP", version="0.1")

    register_users(app)
    register_prg(app)

    # --- Request context (ip/user-agent/request-id) ---
    @app.middleware("http")
    async def request_context_mw(request: Request, call_next):
        ip = _client_ip(request)
        user_agent = request.headers.get("user-agent")
        request_id = request.headers.get("x-request-id")
        set_request_context(ip=ip, user_agent=user_agent, request_id=request_id)
        return await call_next(request)
    # --- Activity log (każdy 'klik' w UI: POST/PUT/PATCH/DELETE) ---
    from crm.core.audit.activity_middleware import activity_log_middleware

    @app.middleware("http")
    async def activity_log_mw(request: Request, call_next):
        return await activity_log_middleware(request, call_next)


    # --- Allowlist IP (ADMIN zone etc. later) ---
    allowed_nets = _parse_allowed_nets(settings.security_allowlist_ips)
    allowlist_enabled = bool(allowed_nets)

    @app.middleware("http")
    async def allowlist_mw(request: Request, call_next):
        if not allowlist_enabled:
            return await call_next(request)

        ip = _client_ip(request)
        if not ip:
            return _deny_unauth()

        try:
            ip_obj = ipaddress.ip_address(ip)
            if any(ip_obj in net for net in allowed_nets):
                return await call_next(request)
            return _deny_unauth()
        except Exception:
            return _deny_unauth()

    # --- Private-by-default (except health + identity/*) ---
    @app.middleware("http")
    async def private_by_default_mw(request: Request, call_next):
        path = request.url.path or "/"

        if path in PUBLIC_PATHS:
            return await call_next(request)

        for prefix in PUBLIC_PREFIXES:
            if prefix and path.startswith(prefix):
                return await call_next(request)

        # identity endpoints are public-ish but auth protected internally
        if path.startswith("/identity/"):
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return _deny_unauth()

        token = auth.split(" ", 1)[1].strip()
        try:
            _ = get_claims(token)  # validates + kill-switch
        except Exception:
            return _deny_unauth()

        return await call_next(request)

    # --- Extra lock: bootstrap mode blocks everything except /identity/*
    @app.middleware("http")
    async def bootstrap_lock_mw(request: Request, call_next):
        path = request.url.path or "/"

        if path.startswith("/identity") or path == "/health":
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
            try:
                claims = get_claims(token)  # sync helper
                if claims.bootstrap_mode:
                    # Tu celowo zostawiamy 403 — to jest już “authorized context”
                    # (token jest), więc nie zdradzamy nic publicznie.
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "System w trybie bootstrap: dostęp tylko do /identity/*"},
                    )
            except Exception:
                pass

        return await call_next(request)

    # --- Routers ---

    # --- Health ---
    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
