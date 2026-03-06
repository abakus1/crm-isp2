from __future__ import annotations

from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from crm.db.models.base import Base

SCHEMA = "crm"


class SmsSmeskomConfig(Base):
    __tablename__ = "sms_smeskom_config"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    enabled: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text("false"))
    primary_base_url: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("'https://api1.smeskom.pl/api/v1'"))
    secondary_base_url: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("'https://api2.smeskom.pl/api/v1'"))
    auth_mode: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default=sa.text("'basic'"))
    login: Mapped[str] = mapped_column(sa.String(128), nullable=False, server_default=sa.text("''"))
    password: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("''"))
    timeout_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default=sa.text("10"))
    callback_enabled: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text("false"))
    callback_url: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("''"))
    callback_secret: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("''"))
    inbound_mode: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default=sa.text("'callback'"))
    receive_mark_as_read: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text("true"))
    receive_poll_interval_seconds: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default=sa.text("60"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_by_staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )


class SmsWebhookEvent(Base):
    __tablename__ = "sms_webhook_events"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'smeskom'"))
    event_kind: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'unknown'"))
    status: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default=sa.text("'received'"))
    remote_addr: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    request_method: Mapped[Optional[str]] = mapped_column(sa.String(16), nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    headers: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    query_params: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    form_data: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    json_data: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    raw_body: Mapped[str] = mapped_column(sa.Text, nullable=False, server_default=sa.text("''"))
    secret_ok: Mapped[bool] = mapped_column(sa.Boolean, nullable=False, server_default=sa.text("false"))
    provider_message_id: Mapped[Optional[str]] = mapped_column(sa.String(128), nullable=True)
    provider_phone: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    provider_sender: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    provider_status: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    received_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    processed_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)


class SmsOutboundMessage(Base):
    __tablename__ = "sms_outbound_messages"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    provider: Mapped[str] = mapped_column(sa.String(32), nullable=False, server_default=sa.text("'smeskom'"))
    status: Mapped[str] = mapped_column(sa.String(24), nullable=False, server_default=sa.text("'queued'"))
    direction: Mapped[str] = mapped_column(sa.String(16), nullable=False, server_default=sa.text("'outbound'"))
    queue_key: Mapped[str] = mapped_column(sa.String(64), nullable=False, server_default=sa.text("'default'"))
    idempotency_key: Mapped[Optional[str]] = mapped_column(sa.String(128), nullable=True)
    recipient_phone: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    sender_name: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)
    body: Mapped[str] = mapped_column(sa.Text, nullable=False)
    body_preview: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    locked_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    attempt_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default=sa.text("0"))
    max_attempts: Mapped[int] = mapped_column(sa.Integer, nullable=False, server_default=sa.text("3"))
    provider_message_id: Mapped[Optional[str]] = mapped_column(sa.String(128), nullable=True)
    provider_last_status: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    provider_response_excerpt: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    meta: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    created_by_staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )


class SmsOutboundAttempt(Base):
    __tablename__ = "sms_outbound_attempts"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    sms_message_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.sms_outbound_messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt_no: Mapped[int] = mapped_column(sa.Integer, nullable=False)
    status: Mapped[str] = mapped_column(sa.String(24), nullable=False, server_default=sa.text("'processing'"))
    provider_http_status: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    provider_message_id: Mapped[Optional[str]] = mapped_column(sa.String(128), nullable=True)
    provider_status: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    response_excerpt: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    request_payload: Mapped[dict] = mapped_column(postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    finished_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
