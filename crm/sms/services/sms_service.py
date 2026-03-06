from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from crm.adapters.sms import SmeskomConnectionSettings
from crm.app.config import get_settings
from crm.db.models.sms import SmsSmeskomConfig, SmsWebhookEvent
from crm.db.models.staff import AuditLog
from crm.shared.request_context import get_request_context


class SmsConfigValidationError(ValueError):
    pass


ALLOWED_AUTH_MODES = {"basic", "body"}
ALLOWED_INBOUND_MODES = {"callback", "polling"}


class SmsConfigService:
    def __init__(self, db: Session):
        self.db = db

    def get_row(self) -> SmsSmeskomConfig | None:
        return self.db.get(SmsSmeskomConfig, 1)

    def get_effective_settings(self) -> tuple[SmeskomConnectionSettings, str]:
        env = get_settings().smeskom
        row = self.get_row()
        if row is None:
            return env, "env"

        password = (row.password or "").strip() or env.password
        callback_secret = (row.callback_secret or "").strip() or env.callback_secret
        persistence_mode = "db"
        if not (row.password or "").strip() or not (row.callback_secret or "").strip():
            persistence_mode = "db+env-fallback"

        effective = SmeskomConnectionSettings(
            enabled=bool(row.enabled),
            primary_base_url=(row.primary_base_url or env.primary_base_url).strip() or env.primary_base_url,
            secondary_base_url=(row.secondary_base_url or env.secondary_base_url).strip() or env.secondary_base_url,
            auth_mode=(row.auth_mode or env.auth_mode).strip() or env.auth_mode,
            login=(row.login or "").strip(),
            password=password,
            timeout_seconds=int(row.timeout_seconds or env.timeout_seconds),
            callback_enabled=bool(row.callback_enabled),
            callback_url=(row.callback_url or "").strip(),
            callback_secret=callback_secret,
            inbound_mode=(row.inbound_mode or env.inbound_mode).strip() or env.inbound_mode,
            receive_mark_as_read=bool(row.receive_mark_as_read),
            receive_poll_interval_seconds=int(row.receive_poll_interval_seconds or env.receive_poll_interval_seconds),
        )
        return effective, persistence_mode

    def upsert_config(self, payload: dict[str, Any], *, actor_staff_id: int) -> SmsSmeskomConfig:
        data = self._normalize_payload(payload)
        row = self.get_row()
        before = self._row_public_dict(row) if row else None

        if row is None:
            row = SmsSmeskomConfig(id=1)
            self.db.add(row)

        row.enabled = data["enabled"]
        row.primary_base_url = data["primary_base_url"]
        row.secondary_base_url = data["secondary_base_url"]
        row.auth_mode = data["auth_mode"]
        row.login = data["login"]
        if data["password"] is not None:
            row.password = data["password"]
        row.timeout_seconds = data["timeout_seconds"]
        row.callback_enabled = data["callback_enabled"]
        row.callback_url = data["callback_url"]
        if data["callback_secret"] is not None:
            row.callback_secret = data["callback_secret"]
        row.inbound_mode = data["inbound_mode"]
        row.receive_mark_as_read = data["receive_mark_as_read"]
        row.receive_poll_interval_seconds = data["receive_poll_interval_seconds"]
        row.updated_at = datetime.now(timezone.utc)
        row.updated_by_staff_user_id = int(actor_staff_id)

        self.db.flush()
        self._audit_config_change(actor_staff_id=actor_staff_id, before=before, after=self._row_public_dict(row))
        self.db.commit()
        self.db.refresh(row)
        return row

    def _audit_config_change(self, *, actor_staff_id: int, before: dict | None, after: dict) -> None:
        ctx = get_request_context()
        self.db.add(
            AuditLog(
                staff_user_id=int(actor_staff_id),
                severity="critical",
                action="SMS_CONFIG_UPDATE",
                entity_type="sms_smeskom_config",
                entity_id="1",
                request_id=ctx.request_id,
                ip=ctx.ip,
                user_agent=ctx.user_agent,
                before=before,
                after=after,
                meta={"provider": "smeskom"},
            )
        )

    def _normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        auth_mode = str(payload.get("auth_mode") or "basic").strip().lower()
        inbound_mode = str(payload.get("inbound_mode") or "callback").strip().lower()
        if auth_mode not in ALLOWED_AUTH_MODES:
            raise SmsConfigValidationError("Nieobsługiwany auth_mode.")
        if inbound_mode not in ALLOWED_INBOUND_MODES:
            raise SmsConfigValidationError("Nieobsługiwany inbound_mode.")

        primary = str(payload.get("primary_base_url") or "https://api1.smeskom.pl/api/v1").strip()
        secondary = str(payload.get("secondary_base_url") or "https://api2.smeskom.pl/api/v1").strip()
        login = str(payload.get("login") or "").strip()
        callback_url = str(payload.get("callback_url") or "").strip()

        try:
            timeout_seconds = int(payload.get("timeout_seconds") or 10)
        except Exception as exc:
            raise SmsConfigValidationError("Timeout musi być liczbą całkowitą.") from exc
        if timeout_seconds < 1 or timeout_seconds > 60:
            raise SmsConfigValidationError("Timeout musi być w zakresie 1-60 sekund.")

        try:
            receive_poll_interval_seconds = int(payload.get("receive_poll_interval_seconds") or 60)
        except Exception as exc:
            raise SmsConfigValidationError("Interwał pollingu musi być liczbą całkowitą.") from exc
        if receive_poll_interval_seconds < 5 or receive_poll_interval_seconds > 3600:
            raise SmsConfigValidationError("Interwał pollingu musi być w zakresie 5-3600 sekund.")

        password = payload.get("password")
        callback_secret = payload.get("callback_secret")
        if password is not None:
            password = str(password)
        if callback_secret is not None:
            callback_secret = str(callback_secret)

        if not primary:
            raise SmsConfigValidationError("Primary API URL jest wymagany.")
        if not secondary:
            raise SmsConfigValidationError("Secondary API URL jest wymagany.")
        if not login:
            raise SmsConfigValidationError("Login API jest wymagany.")
        if bool(payload.get("callback_enabled")) and inbound_mode == "callback" and not callback_url:
            raise SmsConfigValidationError("Dla aktywnego callbacka trzeba podać URL callbacka.")

        return {
            "enabled": bool(payload.get("enabled")),
            "primary_base_url": primary,
            "secondary_base_url": secondary,
            "auth_mode": auth_mode,
            "login": login,
            "password": password,
            "timeout_seconds": timeout_seconds,
            "callback_enabled": bool(payload.get("callback_enabled")),
            "callback_url": callback_url,
            "callback_secret": callback_secret,
            "inbound_mode": inbound_mode,
            "receive_mark_as_read": bool(payload.get("receive_mark_as_read", True)),
            "receive_poll_interval_seconds": receive_poll_interval_seconds,
        }

    @staticmethod
    def _row_public_dict(row: SmsSmeskomConfig | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "enabled": bool(row.enabled),
            "primary_base_url": row.primary_base_url,
            "secondary_base_url": row.secondary_base_url,
            "auth_mode": row.auth_mode,
            "login": row.login,
            "has_password": bool((row.password or "").strip()),
            "timeout_seconds": int(row.timeout_seconds),
            "callback_enabled": bool(row.callback_enabled),
            "callback_url": row.callback_url,
            "has_callback_secret": bool((row.callback_secret or "").strip()),
            "inbound_mode": row.inbound_mode,
            "receive_mark_as_read": bool(row.receive_mark_as_read),
            "receive_poll_interval_seconds": int(row.receive_poll_interval_seconds),
        }


class SmeskomWebhookService:
    def __init__(self, db: Session):
        self.db = db
        self.config_service = SmsConfigService(db)

    async def handle_callback(self, request: Request) -> SmsWebhookEvent:
        effective, _mode = self.config_service.get_effective_settings()
        raw_body_bytes = await request.body()
        raw_body = raw_body_bytes.decode("utf-8", errors="replace")

        query_params = self._flatten_multi_dict(request.query_params)
        form_data = await self._safe_form(request)
        json_data = self._safe_json(raw_body)
        headers = {k.lower(): v for k, v in request.headers.items()}

        secret_ok = self._secret_ok(effective.callback_secret, headers, query_params, form_data, json_data)
        event_kind = self._detect_event_kind(query_params, form_data, json_data)
        status = "accepted" if secret_ok or not (effective.callback_secret or "").strip() else "rejected"

        event = SmsWebhookEvent(
            provider="smeskom",
            event_kind=event_kind,
            status=status,
            remote_addr=(request.client.host if request.client else None),
            request_method=request.method,
            content_type=request.headers.get("content-type"),
            headers=headers,
            query_params=query_params,
            form_data=form_data,
            json_data=json_data,
            raw_body=raw_body,
            secret_ok=bool(secret_ok or not (effective.callback_secret or "").strip()),
            provider_message_id=self._pick_first(query_params, form_data, json_data, ["message_id", "sms_id", "id", "msgid"]),
            provider_phone=self._pick_first(query_params, form_data, json_data, ["phone", "msisdn", "numer", "from_number"]),
            provider_sender=self._pick_first(query_params, form_data, json_data, ["sender", "nadawca", "from"]),
            provider_status=self._pick_first(query_params, form_data, json_data, ["status", "message_status", "delivery_status"]),
            processed_at=datetime.now(timezone.utc) if status == "accepted" else None,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    @staticmethod
    def _flatten_multi_dict(data: Any) -> dict[str, Any]:
        out: dict[str, Any] = {}
        if data is None:
            return out
        try:
            keys = list(data.keys())
        except Exception:
            return out
        for key in keys:
            try:
                values = data.getlist(key)
            except Exception:
                values = [data.get(key)]
            clean_values = [v for v in values if v is not None]
            if len(clean_values) <= 1:
                out[str(key)] = clean_values[0] if clean_values else None
            else:
                out[str(key)] = clean_values
        return out

    async def _safe_form(self, request: Request) -> dict[str, Any]:
        try:
            form = await request.form()
            return self._flatten_multi_dict(form)
        except Exception:
            return {}

    @staticmethod
    def _safe_json(raw_body: str) -> dict[str, Any]:
        if not raw_body.strip():
            return {}
        try:
            data = json.loads(raw_body)
        except Exception:
            return {}
        return data if isinstance(data, dict) else {"_value": data}

    @staticmethod
    def _pick_first(*sources: dict[str, Any], names: list[str]) -> str | None:
        lowered = {name.lower() for name in names}
        for source in sources:
            for key, value in source.items():
                if str(key).lower() in lowered and value not in (None, ""):
                    return str(value)
        return None

    def _secret_ok(self, secret: str, headers: dict[str, Any], query_params: dict[str, Any], form_data: dict[str, Any], json_data: dict[str, Any]) -> bool:
        expected = (secret or "").strip()
        if not expected:
            return True
        candidate = self._pick_first(
            headers,
            query_params,
            form_data,
            json_data,
            names=["x-smeskom-secret", "x-webhook-secret", "x-callback-secret", "secret", "token", "callback_secret"],
        )
        return bool(candidate and candidate == expected)

    @staticmethod
    def _detect_event_kind(query_params: dict[str, Any], form_data: dict[str, Any], json_data: dict[str, Any]) -> str:
        text = " ".join(
            str(v) for src in (query_params, form_data, json_data) for v in [json.dumps(src, ensure_ascii=False)] if src
        ).lower()
        if any(marker in text for marker in ["delivery", "delivered", "doręcz", "status"]):
            return "delivery_status"
        if any(marker in text for marker in ["inbound", "odebran", "incoming", "wiadomosc", "message"]):
            return "inbound_sms"
        return "unknown"
