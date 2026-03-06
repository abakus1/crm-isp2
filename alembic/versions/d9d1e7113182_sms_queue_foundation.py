"""sms_queue_foundation

Revision ID: d9d1e7113182
Revises: 45d5e3b52cc2
Create Date: 2026-03-06 11:06:57.874412

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd9d1e7113182'
down_revision: Union[str, Sequence[str], None] = '45d5e3b52cc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    op.create_table(
        "sms_outbound_messages",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default=sa.text("'smeskom'")),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("direction", sa.String(length=16), nullable=False, server_default=sa.text("'outbound'")),
        sa.Column("queue_key", sa.String(length=64), nullable=False, server_default=sa.text("'default'")),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("recipient_phone", sa.String(length=64), nullable=False),
        sa.Column("sender_name", sa.String(length=32), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("body_preview", sa.String(length=160), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.String(length=255), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default=sa.text("3")),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("provider_last_status", sa.String(length=64), nullable=True),
        sa.Column("provider_response_excerpt", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_staff_user_id", sa.BigInteger(), nullable=True),
        sa.CheckConstraint("provider IN ('smeskom')", name="ck_sms_outbound_messages_provider"),
        sa.CheckConstraint("status IN ('queued', 'processing', 'sent', 'failed', 'cancelled', 'delivered')", name="ck_sms_outbound_messages_status"),
        sa.CheckConstraint("direction IN ('outbound')", name="ck_sms_outbound_messages_direction"),
        sa.CheckConstraint("attempt_count >= 0", name="ck_sms_outbound_messages_attempt_count"),
        sa.CheckConstraint("max_attempts BETWEEN 1 AND 10", name="ck_sms_outbound_messages_max_attempts"),
        sa.ForeignKeyConstraint(["created_by_staff_user_id"], [f"{SCHEMA}.staff_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )

    op.create_table(
        "sms_outbound_attempts",
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("sms_message_id", sa.BigInteger(), nullable=False),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default=sa.text("'processing'")),
        sa.Column("provider_http_status", sa.Integer(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=128), nullable=True),
        sa.Column("provider_status", sa.String(length=64), nullable=True),
        sa.Column("response_excerpt", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('processing', 'sent', 'failed')", name="ck_sms_outbound_attempts_status"),
        sa.ForeignKeyConstraint(["sms_message_id"], [f"{SCHEMA}.sms_outbound_messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema=SCHEMA,
    )

    op.create_index("ix_sms_outbound_messages_status_scheduled_at", "sms_outbound_messages", ["status", "scheduled_at"], unique=False, schema=SCHEMA)
    op.create_index("ix_sms_outbound_messages_provider_message_id", "sms_outbound_messages", ["provider_message_id"], unique=False, schema=SCHEMA)
    op.create_index("ix_sms_outbound_messages_idempotency_key", "sms_outbound_messages", ["idempotency_key"], unique=True, schema=SCHEMA, postgresql_where=sa.text("idempotency_key IS NOT NULL"))
    op.create_index("ix_sms_outbound_attempts_sms_message_id_attempt_no", "sms_outbound_attempts", ["sms_message_id", "attempt_no"], unique=True, schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("ix_sms_outbound_attempts_sms_message_id_attempt_no", table_name="sms_outbound_attempts", schema=SCHEMA)
    op.drop_index("ix_sms_outbound_messages_idempotency_key", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_index("ix_sms_outbound_messages_provider_message_id", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_index("ix_sms_outbound_messages_status_scheduled_at", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_table("sms_outbound_attempts", schema=SCHEMA)
    op.drop_table("sms_outbound_messages", schema=SCHEMA)
