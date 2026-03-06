"""sms_smeskom_persistence_and_webhook

Revision ID: 45d5e3b52cc2
Revises: feb4c52f6809
Create Date: 2026-03-06 09:35:05.170418

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '45d5e3b52cc2'
down_revision: Union[str, Sequence[str], None] = 'feb4c52f6809'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    op.create_table(
        "sms_smeskom_config",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "primary_base_url",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'https://api1.smeskom.pl/api/v1'"),
        ),
        sa.Column(
            "secondary_base_url",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'https://api2.smeskom.pl/api/v1'"),
        ),
        sa.Column("auth_mode", sa.String(length=16), nullable=False, server_default=sa.text("'basic'")),
        sa.Column("login", sa.String(length=128), nullable=False, server_default=sa.text("''")),
        sa.Column("password", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("timeout_seconds", sa.Integer(), nullable=False, server_default=sa.text("10")),
        sa.Column("callback_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("callback_url", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("callback_secret", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("inbound_mode", sa.String(length=16), nullable=False, server_default=sa.text("'callback'")),
        sa.Column("receive_mark_as_read", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "receive_poll_interval_seconds",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("60"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_by_staff_user_id", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("id = 1", name="ck_sms_smeskom_config_singleton"),
        sa.CheckConstraint("auth_mode IN ('basic', 'body')", name="ck_sms_smeskom_config_auth_mode"),
        sa.CheckConstraint("inbound_mode IN ('callback', 'polling')", name="ck_sms_smeskom_config_inbound_mode"),
        sa.CheckConstraint("timeout_seconds BETWEEN 1 AND 60", name="ck_sms_smeskom_config_timeout"),
        sa.CheckConstraint(
            "receive_poll_interval_seconds BETWEEN 5 AND 3600",
            name="ck_sms_smeskom_config_poll_interval",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_staff_user_id"],
            [f"{SCHEMA}.staff_users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )

    op.create_table(
        "sms_webhook_events",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default=sa.text("'smeskom'")),
        sa.Column("event_kind", sa.String(length=32), nullable=False, server_default=sa.text("'unknown'")),
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'received'")),
        sa.Column("remote_addr", sa.String(length=64), nullable=True),
        sa.Column("request_method", sa.String(length=16), nullable=True),
        sa.Column("content_type", sa.String(length=255), nullable=True),
        sa.Column("headers", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("query_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("form_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("json_data", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("raw_body", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column("secret_ok", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("provider_phone", sa.String(length=64), nullable=True),
        sa.Column("provider_sender", sa.String(length=255), nullable=True),
        sa.Column("provider_status", sa.String(length=64), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("provider IN ('smeskom')", name="ck_sms_webhook_events_provider"),
        sa.CheckConstraint(
            "status IN ('received', 'ignored', 'rejected', 'accepted')",
            name="ck_sms_webhook_events_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )

    op.create_index(
        "ix_sms_webhook_events_provider_received_at",
        "sms_webhook_events",
        ["provider", "received_at"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sms_webhook_events_status_received_at",
        "sms_webhook_events",
        ["status", "received_at"],
        unique=False,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_sms_webhook_events_status_received_at", table_name="sms_webhook_events", schema=SCHEMA)
    op.drop_index("ix_sms_webhook_events_provider_received_at", table_name="sms_webhook_events", schema=SCHEMA)
    op.drop_table("sms_webhook_events", schema=SCHEMA)
    op.drop_table("sms_smeskom_config", schema=SCHEMA)