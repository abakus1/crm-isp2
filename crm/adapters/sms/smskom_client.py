from __future__ import annotations

import base64
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


class SmeskomApiError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class SmeskomConnectionSettings:
    enabled: bool = False
    primary_base_url: str = "https://api1.smeskom.pl/api/v1"
    secondary_base_url: str = "https://api2.smeskom.pl/api/v1"
    auth_mode: str = "basic"
    login: str = ""
    password: str = ""
    timeout_seconds: int = 10
    callback_enabled: bool = False
    callback_url: str = ""
    callback_secret: str = ""
    inbound_mode: str = "callback"
    receive_mark_as_read: bool = True
    receive_poll_interval_seconds: int = 60

    def sanitized(self) -> dict[str, Any]:
        return {
            "enabled": bool(self.enabled),
            "primary_base_url": self.primary_base_url,
            "secondary_base_url": self.secondary_base_url,
            "auth_mode": self.auth_mode,
            "login": self.login,
            "has_password": bool(self.password),
            "timeout_seconds": int(self.timeout_seconds),
            "callback_enabled": bool(self.callback_enabled),
            "callback_url": self.callback_url,
            "has_callback_secret": bool(self.callback_secret),
            "inbound_mode": self.inbound_mode,
            "receive_mark_as_read": bool(self.receive_mark_as_read),
            "receive_poll_interval_seconds": int(self.receive_poll_interval_seconds),
        }


@dataclass(frozen=True)
class SmeskomConnectionResult:
    ok: bool
    base_url_used: str
    auth_mode: str
    http_status: int | None
    provider_message: str
    response_excerpt: str | None = None


class SmeskomClient:
    def __init__(self, settings: SmeskomConnectionSettings):
        self.settings = settings

    def ping(self) -> SmeskomConnectionResult:
        last_error: SmeskomApiError | None = None
        for base_url in self._candidate_urls():
            try:
                response = self._request("GET", base_url, "sms/status")
                return SmeskomConnectionResult(
                    ok=True,
                    base_url_used=base_url,
                    auth_mode=self.settings.auth_mode,
                    http_status=response["status_code"],
                    provider_message="Połączenie z SMeSKom wygląda poprawnie.",
                    response_excerpt=self._excerpt(response.get("body_text")),
                )
            except SmeskomApiError as exc:
                last_error = exc
                continue

        if last_error is None:
            raise SmeskomApiError("Nie udało się nawiązać połączenia z SMeSKom.")

        return SmeskomConnectionResult(
            ok=False,
            base_url_used=self._candidate_urls()[-1],
            auth_mode=self.settings.auth_mode,
            http_status=last_error.status_code,
            provider_message=str(last_error),
            response_excerpt=self._excerpt(self._stringify_detail(last_error.detail)),
        )

    def _candidate_urls(self) -> list[str]:
        urls: list[str] = []
        for raw in [self.settings.primary_base_url, self.settings.secondary_base_url]:
            val = (raw or "").strip().rstrip("/")
            if val and val not in urls:
                urls.append(val)
        if not urls:
            urls.append("https://api1.smeskom.pl/api/v1")
        return urls

    def _request(self, method: str, base_url: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "CRM-ISP2-SMeSKom/0.1",
        }

        body_payload = dict(payload or {})
        if self.settings.auth_mode == "basic":
            creds = f"{self.settings.login}:{self.settings.password}".encode("utf-8")
            headers["Authorization"] = "Basic " + base64.b64encode(creds).decode("ascii")
        elif self.settings.auth_mode == "body":
            body_payload.setdefault("login", self.settings.login)
            body_payload.setdefault("password", self.settings.password)
        else:
            raise SmeskomApiError(f"Nieobsługiwany auth_mode={self.settings.auth_mode!r}")

        data: bytes | None = None
        req_url = url
        if method.upper() == "GET":
            if body_payload:
                query = urllib.parse.urlencode(body_payload, doseq=True)
                req_url = f"{url}?{query}"
            headers.pop("Content-Type", None)
        else:
            data = json.dumps(body_payload).encode("utf-8")

        request = urllib.request.Request(req_url, data=data, headers=headers, method=method.upper())

        try:
            with urllib.request.urlopen(request, timeout=max(1, int(self.settings.timeout_seconds))) as response:
                raw = response.read().decode("utf-8", errors="replace")
                return {
                    "status_code": getattr(response, "status", 200),
                    "body_text": raw,
                }
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            raise SmeskomApiError(
                f"SMeSKom zwrócił HTTP {exc.code}.",
                status_code=exc.code,
                detail=raw,
            ) from exc
        except urllib.error.URLError as exc:
            reason = exc.reason
            if isinstance(reason, socket.timeout):
                msg = "Timeout połączenia z SMeSKom."
            else:
                msg = f"Błąd połączenia z SMeSKom: {reason}"
            raise SmeskomApiError(msg, detail=str(reason)) from exc
        except Exception as exc:  # pragma: no cover - safety net
            raise SmeskomApiError(f"Nieoczekiwany błąd połączenia z SMeSKom: {exc}") from exc

    @staticmethod
    def _excerpt(text: str | None, limit: int = 300) -> str | None:
        if text is None:
            return None
        clean = " ".join(str(text).split())
        if len(clean) <= limit:
            return clean
        return clean[: limit - 1] + "…"

    @staticmethod
    def _stringify_detail(detail: Any) -> str | None:
        if detail is None:
            return None
        if isinstance(detail, str):
            return detail
        try:
            return json.dumps(detail, ensure_ascii=False)
        except Exception:
            return str(detail)
