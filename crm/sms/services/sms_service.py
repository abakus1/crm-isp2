from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from crm.adapters.sms import SmeskomApiError, SmeskomClient, SmeskomConnectionSettings
from crm.app.config import get_settings
from crm.db.models.sms import (
    SmsOutboundAttempt,
    SmsOutboundMessage,
    SmsSmeskomConfig,
    SmsWebhookEvent,
)
from crm.db.models.staff import AuditLog, StaffUser
from crm.shared.request_context import get_request_context


class SmsConfigValidationError(ValueError):
    pass


class SmsQueueValidationError(ValueError):
    pass


ALLOWED_AUTH_MODES = {"basic", "body"}
ALLOWED_INBOUND_MODES = {"callback", "polling"}
ALLOWED_QUEUE_STATUSES = {"queued", "processing", "sent", "failed", "cancelled", "delivered"}
DELIVERY_SUCCESS_STATUSES = {"delivered", "deliver", "doręczono", "ok", "success"}
DELIVERY_FAILURE_STATUSES = {"failed", "error", "expired", "rejected", "undelivered"}
LOCK_TTL_SECONDS = 120
MAX_RESPONSE_EXCERPT = 1000


@dataclass(frozen=True)
class SmsQueueSummary:
    queued: int
    processing: int
    sent: int
    failed: int
    cancelled: int
    delivered: int


@dataclass(frozen=True)
class SmsDispatchBatchResult:
    claimed: int
    sent: int
    delivered: int
    failed: int
    requeued: int
    skipped: int


@dataclass(frozen=True)
class SubscriberSmsHistoryRow:
    id: int
    subscriber_id: int | None
    status: str
    queue_key: str
    recipient_phone: str
    sender_name: str | None
    title: str | None
    body: str
    body_preview: str
    provider: str
    provider_message_id: str | None
    provider_last_status: str | None
    attempt_count: int
    max_attempts: int
    scheduled_at: datetime | None
    sent_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime | None
    created_by_staff_user_id: int | None
    created_by_label: str | None


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
        self._audit(
            actor_staff_id=actor_staff_id,
            action="SMS_CONFIG_UPDATE",
            severity="critical",
            entity_type="sms_smeskom_config",
            entity_id="1",
            before=before,
            after=self._row_public_dict(row),
            meta={"provider": "smeskom"},
        )
        self.db.commit()
        self.db.refresh(row)
        return row

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

    def _audit(self, *, actor_staff_id: int | None, action: str, severity: str, entity_type: str | None, entity_id: str | None, before: dict | None, after: dict | None, meta: dict[str, Any] | None) -> None:
        ctx = get_request_context()
        self.db.add(
            AuditLog(
                staff_user_id=int(actor_staff_id) if actor_staff_id is not None else None,
                severity=severity,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                request_id=ctx.request_id,
                ip=ctx.ip,
                user_agent=ctx.user_agent,
                before=before,
                after=after,
                meta=meta,
            )
        )


class SmsQueueService:
    def __init__(self, db: Session):
        self.db = db
        self.config_service = SmsConfigService(db)

    def enqueue_message(self, payload: dict[str, Any], *, actor_staff_id: int) -> SmsOutboundMessage:
        normalized = self._normalize_enqueue_payload(payload)
        existing = self._get_existing_by_idempotency(normalized["idempotency_key"])
        if existing is not None:
            return existing

        now = datetime.now(timezone.utc)
        message = SmsOutboundMessage(
            provider="smeskom",
            status="queued",
            direction="outbound",
            queue_key=normalized["queue_key"],
            idempotency_key=normalized["idempotency_key"],
            subscriber_id=normalized["subscriber_id"],
            recipient_phone=normalized["recipient_phone"],
            sender_name=normalized["sender_name"],
            body=normalized["body"],
            body_preview=self._build_body_preview(normalized["body"]),
            scheduled_at=normalized["scheduled_at"],
            next_attempt_at=normalized["scheduled_at"],
            max_attempts=normalized["max_attempts"],
            meta=normalized["meta"],
            created_by_staff_user_id=int(actor_staff_id),
            updated_at=now,
        )
        self.db.add(message)
        self.db.flush()
        self.config_service._audit(
            actor_staff_id=actor_staff_id,
            action="SMS_QUEUE_ENQUEUE",
            severity="info",
            entity_type="sms_outbound_message",
            entity_id=str(message.id),
            before=None,
            after=self._message_public_dict(message),
            meta={
                "provider": "smeskom",
                "queue_key": normalized["queue_key"],
                "subscriber_id": normalized["subscriber_id"],
            },
        )
        self.db.commit()
        self.db.refresh(message)
        return message

    def list_messages(self, *, limit: int = 50, status: str | None = None) -> list[SmsOutboundMessage]:
        safe_limit = max(1, min(int(limit), 200))
        stmt = select(SmsOutboundMessage).order_by(SmsOutboundMessage.id.desc()).limit(safe_limit)
        if status:
            normalized_status = str(status).strip().lower()
            if normalized_status not in ALLOWED_QUEUE_STATUSES:
                raise SmsQueueValidationError("Nieobsługiwany status kolejki SMS.")
            stmt = stmt.where(SmsOutboundMessage.status == normalized_status)
        return list(self.db.execute(stmt).scalars().all())

    def list_subscriber_messages(self, *, subscriber_id: int, limit: int = 100) -> list[SubscriberSmsHistoryRow]:
        safe_limit = max(1, min(int(limit), 200))
        creator_label = func.trim(func.concat(func.coalesce(StaffUser.first_name, ""), " ", func.coalesce(StaffUser.last_name, "")))
        stmt = (
            select(
                SmsOutboundMessage.id,
                SmsOutboundMessage.subscriber_id,
                SmsOutboundMessage.status,
                SmsOutboundMessage.queue_key,
                SmsOutboundMessage.recipient_phone,
                SmsOutboundMessage.sender_name,
                SmsOutboundMessage.meta,
                SmsOutboundMessage.body,
                SmsOutboundMessage.body_preview,
                SmsOutboundMessage.provider,
                SmsOutboundMessage.provider_message_id,
                SmsOutboundMessage.provider_last_status,
                SmsOutboundMessage.attempt_count,
                SmsOutboundMessage.max_attempts,
                SmsOutboundMessage.scheduled_at,
                SmsOutboundMessage.sent_at,
                SmsOutboundMessage.delivered_at,
                SmsOutboundMessage.created_at,
                SmsOutboundMessage.created_by_staff_user_id,
                func.coalesce(func.nullif(creator_label, ""), StaffUser.username).label("created_by_label"),
            )
            .select_from(SmsOutboundMessage)
            .outerjoin(StaffUser, StaffUser.id == SmsOutboundMessage.created_by_staff_user_id)
            .where(SmsOutboundMessage.subscriber_id == int(subscriber_id))
            .order_by(SmsOutboundMessage.id.desc())
            .limit(safe_limit)
        )
        rows = self.db.execute(stmt).all()
        out: list[SubscriberSmsHistoryRow] = []
        for row in rows:
            data = dict(row._mapping)
            meta = data.pop("meta", None) or {}
            data["title"] = str(meta.get("title") or "").strip() or None
            out.append(SubscriberSmsHistoryRow(**data))
        return out

    def get_summary(self) -> SmsQueueSummary:
        rows = self.db.execute(
            select(SmsOutboundMessage.status, func.count(SmsOutboundMessage.id)).group_by(SmsOutboundMessage.status)
        ).all()
        counts = {status: int(count) for status, count in rows}
        return SmsQueueSummary(
            queued=counts.get("queued", 0),
            processing=counts.get("processing", 0),
            sent=counts.get("sent", 0),
            failed=counts.get("failed", 0),
            cancelled=counts.get("cancelled", 0),
            delivered=counts.get("delivered", 0),
        )

    def release_expired_locks(self) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            select(SmsOutboundMessage)
            .where(SmsOutboundMessage.status == "processing")
            .where(SmsOutboundMessage.lock_expires_at.is_not(None))
            .where(SmsOutboundMessage.lock_expires_at <= now)
        )
        messages = list(self.db.execute(stmt).scalars().all())
        count = 0
        for message in messages:
            message.status = "queued"
            message.locked_at = None
            message.lock_token = None
            message.lock_expires_at = None
            message.next_attempt_at = now
            message.updated_at = now
            count += 1
        if count:
            self.db.commit()
        return count

    def dispatch_due_batch(self, *, actor_staff_id: int | None, batch_size: int = 10) -> SmsDispatchBatchResult:
        if batch_size < 1:
            raise SmsQueueValidationError("batch_size musi być >= 1.")
        effective, _ = self.config_service.get_effective_settings()
        if not effective.enabled:
            raise SmsQueueValidationError("Integracja SMeSKom jest wyłączona. Najpierw aktywuj konfigurację SMS.")

        self.release_expired_locks()
        claimed = sent = delivered = failed = requeued = skipped = 0
        for _ in range(batch_size):
            message = self._claim_next_message()
            if message is None:
                break
            claimed += 1
            final = self._dispatch_claimed_message(message=message, effective=effective, actor_staff_id=actor_staff_id)
            if final == "sent":
                sent += 1
            elif final == "delivered":
                delivered += 1
            elif final == "failed":
                failed += 1
            elif final == "queued":
                requeued += 1
            else:
                skipped += 1
        return SmsDispatchBatchResult(claimed=claimed, sent=sent, delivered=delivered, failed=failed, requeued=requeued, skipped=skipped)

    def dispatch_next(self, *, actor_staff_id: int) -> SmsOutboundMessage | None:
        effective, _ = self.config_service.get_effective_settings()
        if not effective.enabled:
            raise SmsQueueValidationError("Integracja SMeSKom jest wyłączona. Najpierw aktywuj konfigurację SMS.")
        self.release_expired_locks()
        message = self._claim_next_message()
        if message is None:
            return None
        self._dispatch_claimed_message(message=message, effective=effective, actor_staff_id=actor_staff_id)
        self.db.refresh(message)
        return message

    def process_delivery_reports(self, *, limit: int = 100, actor_staff_id: int | None = None) -> int:
        safe_limit = max(1, min(int(limit), 500))
        stmt = (
            select(SmsWebhookEvent)
            .where(SmsWebhookEvent.event_kind == "delivery_report")
            .where(SmsWebhookEvent.status == "accepted")
            .where(SmsWebhookEvent.processed_result.is_(None))
            .order_by(SmsWebhookEvent.id.asc())
            .limit(safe_limit)
        )
        events = list(self.db.execute(stmt).scalars().all())
        processed = 0
        for event in events:
            if self._apply_delivery_report(event=event, actor_staff_id=actor_staff_id):
                processed += 1
        self.db.commit()
        return processed

    def _apply_delivery_report(self, *, event: SmsWebhookEvent, actor_staff_id: int | None) -> bool:
        message = None
        if event.provider_message_id:
            message = self.db.execute(
                select(SmsOutboundMessage)
                .where(SmsOutboundMessage.provider == event.provider)
                .where(SmsOutboundMessage.provider_message_id == event.provider_message_id)
                .limit(1)
            ).scalars().first()
        now = datetime.now(timezone.utc)
        event.processed_at = now
        event.linked_sms_message_id = int(message.id) if message is not None else None

        if message is None:
            event.processed_result = "message_not_found"
            return False

        before = self._message_public_dict(message)
        provider_status = (event.provider_status or "").strip().lower()
        message.provider_last_status = (event.provider_status or message.provider_last_status or "").strip() or None
        message.delivered_by_webhook_event_id = int(event.id)
        message.updated_at = now

        if provider_status in DELIVERY_SUCCESS_STATUSES:
            message.status = "delivered"
            message.delivered_at = message.delivered_at or now
            event.processed_result = "message_delivered"
        elif provider_status in DELIVERY_FAILURE_STATUSES:
            message.status = "failed"
            message.last_error_at = now
            message.last_error_message = f"Delivery report: {event.provider_status}"
            event.processed_result = "message_failed_by_delivery_report"
        else:
            event.processed_result = f"ignored_status:{provider_status or 'empty'}"

        self.config_service._audit(
            actor_staff_id=actor_staff_id,
            action="SMS_DELIVERY_REPORT_PROCESSED",
            severity="info",
            entity_type="sms_outbound_message",
            entity_id=str(message.id),
            before=before,
            after=self._message_public_dict(message),
            meta={
                "provider": event.provider,
                "event_id": int(event.id),
                "provider_message_id": event.provider_message_id,
                "provider_status": event.provider_status,
            },
        )
        return True

    def _claim_next_message(self) -> SmsOutboundMessage | None:
        now = datetime.now(timezone.utc)
        token = uuid.uuid4().hex
        stmt = (
            select(SmsOutboundMessage)
            .where(SmsOutboundMessage.status == "queued")
            .where(SmsOutboundMessage.scheduled_at <= now)
            .where(SmsOutboundMessage.next_attempt_at <= now)
            .where(or_(SmsOutboundMessage.lock_expires_at.is_(None), SmsOutboundMessage.lock_expires_at < now))
            .order_by(SmsOutboundMessage.next_attempt_at.asc(), SmsOutboundMessage.id.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        message = self.db.execute(stmt).scalars().first()
        if message is None:
            self.db.rollback()
            return None

        message.status = "processing"
        message.locked_at = now
        message.lock_token = token
        message.lock_expires_at = now + timedelta(seconds=LOCK_TTL_SECONDS)
        message.updated_at = now
        self.db.commit()
        self.db.refresh(message)
        return message

    def _dispatch_claimed_message(self, *, message: SmsOutboundMessage, effective: SmeskomConnectionSettings, actor_staff_id: int | None) -> str:
        now = datetime.now(timezone.utc)
        before = self._message_public_dict(message)
        attempt = SmsOutboundAttempt(
            sms_message_id=int(message.id),
            attempt_no=int(message.attempt_count) + 1,
            status="processing",
            request_payload={
                "recipient_phone": message.recipient_phone,
                "sender_name": message.sender_name,
                "body": message.body,
            },
        )
        self.db.add(attempt)
        self.db.flush()

        client = SmeskomClient(effective)
        final_status = "queued"
        try:
            result = client.send_sms(to=message.recipient_phone, message=message.body, sender=message.sender_name)
            provider_status = (result.provider_status or "sent").strip().lower()
            message.status = "delivered" if provider_status in DELIVERY_SUCCESS_STATUSES else "sent"
            message.sent_at = now
            if message.status == "delivered":
                message.delivered_at = now
            message.locked_at = None
            message.lock_token = None
            message.lock_expires_at = None
            message.last_error_at = None
            message.last_error_message = None
            message.attempt_count = int(message.attempt_count) + 1
            message.provider_message_id = result.provider_message_id
            message.provider_last_status = result.provider_status or message.status
            message.provider_response_excerpt = self._clip(result.response_excerpt)
            message.updated_at = now
            message.next_attempt_at = now

            attempt.status = message.status
            attempt.provider_http_status = result.http_status
            attempt.provider_message_id = result.provider_message_id
            attempt.provider_status = result.provider_status or message.status
            attempt.response_excerpt = self._clip(result.response_excerpt)
            attempt.finished_at = now
            final_status = message.status
        except SmeskomApiError as exc:
            message.attempt_count = int(message.attempt_count) + 1
            message.locked_at = None
            message.lock_token = None
            message.lock_expires_at = None
            message.last_error_at = now
            message.last_error_message = str(exc)
            message.provider_last_status = "failed"
            message.provider_response_excerpt = self._clip(str(exc))
            message.updated_at = now
            if int(message.attempt_count) >= int(message.max_attempts):
                message.status = "failed"
                final_status = "failed"
            else:
                message.status = "queued"
                message.next_attempt_at = now + timedelta(seconds=self._compute_backoff_seconds(int(message.attempt_count)))
                final_status = "queued"

            attempt.status = "failed"
            attempt.error_message = str(exc)
            attempt.finished_at = now
        finally:
            self.db.flush()

        self.config_service._audit(
            actor_staff_id=actor_staff_id,
            action="SMS_QUEUE_DISPATCH_NEXT",
            severity="info",
            entity_type="sms_outbound_message",
            entity_id=str(message.id),
            before=before,
            after=self._message_public_dict(message),
            meta={
                "provider": "smeskom",
                "attempt_count": int(message.attempt_count),
                "final_status": final_status,
            },
        )
        self.db.commit()
        self.db.refresh(message)
        return final_status

    def _get_existing_by_idempotency(self, idempotency_key: str | None) -> SmsOutboundMessage | None:
        if not idempotency_key:
            return None
        return self.db.execute(
            select(SmsOutboundMessage).where(SmsOutboundMessage.idempotency_key == idempotency_key)
        ).scalars().first()

    def _normalize_enqueue_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        recipient_phone = str(payload.get("recipient_phone") or "").strip()
        body = str(payload.get("body") or "").strip()
        sender_name_raw = payload.get("sender_name")
        sender_name = str(sender_name_raw).strip() if sender_name_raw is not None else None
        sender_name = sender_name or None
        queue_key = str(payload.get("queue_key") or "default").strip() or "default"
        idempotency_key_raw = payload.get("idempotency_key")
        idempotency_key = str(idempotency_key_raw).strip() if idempotency_key_raw is not None else None
        subscriber_id_raw = payload.get("subscriber_id")
        subscriber_id = int(subscriber_id_raw) if subscriber_id_raw not in (None, "") else None
        max_attempts = int(payload.get("max_attempts") or 3)
        meta = payload.get("meta") or {}
        title_raw = payload.get("title")
        if title_raw not in (None, ""):
            if not isinstance(meta, dict):
                raise SmsQueueValidationError("Pole meta musi być obiektem JSON.")
            meta = dict(meta)
            meta["title"] = str(title_raw).strip()
        scheduled_at_value = payload.get("scheduled_at")

        if not recipient_phone:
            raise SmsQueueValidationError("Numer odbiorcy jest wymagany.")
        if not body:
            raise SmsQueueValidationError("Treść SMS jest wymagana.")
        if len(body) > 2000:
            raise SmsQueueValidationError("Treść SMS jest zbyt długa dla kolejki foundation (max 2000 znaków).")
        if max_attempts < 1 or max_attempts > 10:
            raise SmsQueueValidationError("max_attempts musi być w zakresie 1-10.")
        if not isinstance(meta, dict):
            raise SmsQueueValidationError("Pole meta musi być obiektem JSON.")

        if scheduled_at_value:
            if isinstance(scheduled_at_value, str):
                scheduled_at = datetime.fromisoformat(scheduled_at_value.replace("Z", "+00:00"))
            elif isinstance(scheduled_at_value, datetime):
                scheduled_at = scheduled_at_value
            else:
                raise SmsQueueValidationError("Nieobsługiwany format scheduled_at.")
            if scheduled_at.tzinfo is None:
                scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        else:
            scheduled_at = datetime.now(timezone.utc)

        return {
            "recipient_phone": recipient_phone,
            "body": body,
            "sender_name": sender_name,
            "queue_key": queue_key,
            "idempotency_key": idempotency_key,
            "subscriber_id": subscriber_id,
            "max_attempts": max_attempts,
            "scheduled_at": scheduled_at,
            "meta": meta,
        }

    @staticmethod
    def _compute_backoff_seconds(attempt_count: int) -> int:
        schedule = [30, 120, 300, 900, 1800, 3600]
        idx = max(0, min(int(attempt_count) - 1, len(schedule) - 1))
        return schedule[idx]

    @staticmethod
    def _build_body_preview(body: str, limit: int = 160) -> str:
        clean = " ".join(str(body).split())
        if len(clean) <= limit:
            return clean
        return clean[: limit - 1] + "…"

    @staticmethod
    def _clip(value: str | None, limit: int = MAX_RESPONSE_EXCERPT) -> str | None:
        if value is None:
            return None
        raw = str(value)
        return raw if len(raw) <= limit else raw[: limit - 1] + "…"

    @staticmethod
    def _message_public_dict(message: SmsOutboundMessage) -> dict[str, Any]:
        return {
            "id": int(message.id),
            "provider": message.provider,
            "status": message.status,
            "queue_key": message.queue_key,
            "subscriber_id": int(message.subscriber_id) if message.subscriber_id is not None else None,
            "recipient_phone": message.recipient_phone,
            "sender_name": message.sender_name,
            "body_preview": message.body_preview,
            "attempt_count": int(message.attempt_count),
            "max_attempts": int(message.max_attempts),
            "provider_message_id": message.provider_message_id,
            "provider_last_status": message.provider_last_status,
            "scheduled_at": message.scheduled_at.isoformat() if message.scheduled_at else None,
            "next_attempt_at": message.next_attempt_at.isoformat() if message.next_attempt_at else None,
            "sent_at": message.sent_at.isoformat() if message.sent_at else None,
            "delivered_at": message.delivered_at.isoformat() if message.delivered_at else None,
            "created_at": message.created_at.isoformat() if message.created_at else None,
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
            payload = json.loads(raw_body)
            return payload if isinstance(payload, dict) else {"_raw": payload}
        except Exception:
            return {}

    @staticmethod
    def _secret_ok(secret: str, headers: dict[str, Any], query_params: dict[str, Any], form_data: dict[str, Any], json_data: dict[str, Any]) -> bool:
        expected = (secret or "").strip()
        if not expected:
            return False
        candidates = [
            headers.get("x-callback-secret"),
            headers.get("x-webhook-secret"),
            query_params.get("secret"),
            query_params.get("token"),
            form_data.get("secret"),
            form_data.get("token"),
            json_data.get("secret"),
            json_data.get("token"),
        ]
        for candidate in candidates:
            if candidate is None:
                continue
            if str(candidate).strip() == expected:
                return True
        return False

    @staticmethod
    def _detect_event_kind(query_params: dict[str, Any], form_data: dict[str, Any], json_data: dict[str, Any]) -> str:
        payloads = [query_params, form_data, json_data]
        for payload in payloads:
            kind = SmeskomWebhookService._pick_first(payload, {}, {}, ["event", "event_kind", "type", "kind"])
            if kind:
                normalized = str(kind).strip().lower()
                if normalized in {"delivery", "delivery_report", "dlr"}:
                    return "delivery_report"
                if normalized in {"inbound", "mo", "received_sms"}:
                    return "inbound_sms"
                return normalized[:32]
        if SmeskomWebhookService._pick_first(query_params, form_data, json_data, ["status", "delivery_status"]):
            return "delivery_report"
        if SmeskomWebhookService._pick_first(query_params, form_data, json_data, ["message", "text", "body"]):
            return "inbound_sms"
        return "unknown"

    @staticmethod
    def _pick_first(query_params: dict[str, Any], form_data: dict[str, Any], json_data: dict[str, Any], keys: list[str]) -> str | None:
        for payload in [query_params, form_data, json_data]:
            if not isinstance(payload, dict):
                continue
            for key in keys:
                value = payload.get(key)
                if value is None:
                    continue
                if isinstance(value, list):
                    for item in value:
                        normalized = str(item).strip()
                        if normalized:
                            return normalized
                    continue
                normalized = str(value).strip()
                if normalized:
                    return normalized
        return None
