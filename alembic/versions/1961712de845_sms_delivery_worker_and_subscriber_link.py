"""sms_delivery_worker_and_subscriber_link

Revision ID: 1961712de845
Revises: 97dcba8cd941
Create Date: 2026-03-06 19:39:42.576328

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1961712de845'
down_revision: Union[str, Sequence[str], None] = '97dcba8cd941'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    op.add_column(
        "sms_outbound_messages",
        sa.Column("subscriber_id", sa.BigInteger(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_outbound_messages",
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_outbound_messages",
        sa.Column("lock_token", sa.String(length=64), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_outbound_messages",
        sa.Column("lock_expires_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_outbound_messages",
        sa.Column("last_error_message", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_outbound_messages",
        sa.Column("delivered_by_webhook_event_id", sa.BigInteger(), nullable=True),
        schema=SCHEMA,
    )

    op.create_foreign_key(
        "fk_sms_outbound_messages_subscriber_id",
        "sms_outbound_messages",
        "subscribers",
        ["subscriber_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sms_outbound_messages_delivered_by_webhook_event_id",
        "sms_outbound_messages",
        "sms_webhook_events",
        ["delivered_by_webhook_event_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_sms_outbound_messages_subscriber_id_created_at",
        "sms_outbound_messages",
        ["subscriber_id", "created_at"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sms_outbound_messages_status_next_attempt_at",
        "sms_outbound_messages",
        ["status", "next_attempt_at"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sms_outbound_messages_lock_expires_at",
        "sms_outbound_messages",
        ["lock_expires_at"],
        unique=False,
        schema=SCHEMA,
    )

    op.execute(
        f"""
        UPDATE {SCHEMA}.sms_outbound_messages
        SET next_attempt_at = COALESCE(scheduled_at, created_at, now())
        WHERE next_attempt_at IS NULL
        """
    )
    op.alter_column(
        "sms_outbound_messages",
        "next_attempt_at",
        schema=SCHEMA,
        server_default=None,
    )

    op.add_column(
        "sms_webhook_events",
        sa.Column("processed_result", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "sms_webhook_events",
        sa.Column("linked_sms_message_id", sa.BigInteger(), nullable=True),
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "fk_sms_webhook_events_linked_sms_message_id",
        "sms_webhook_events",
        "sms_outbound_messages",
        ["linked_sms_message_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_sms_webhook_events_event_kind_status_received_at",
        "sms_webhook_events",
        ["event_kind", "status", "received_at"],
        unique=False,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sms_webhook_events_provider_message_id",
        "sms_webhook_events",
        ["provider_message_id"],
        unique=False,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("ix_sms_webhook_events_provider_message_id", table_name="sms_webhook_events", schema=SCHEMA)
    op.drop_index("ix_sms_webhook_events_event_kind_status_received_at", table_name="sms_webhook_events", schema=SCHEMA)
    op.drop_constraint("fk_sms_webhook_events_linked_sms_message_id", "sms_webhook_events", schema=SCHEMA, type_="foreignkey")
    op.drop_column("sms_webhook_events", "linked_sms_message_id", schema=SCHEMA)
    op.drop_column("sms_webhook_events", "processed_result", schema=SCHEMA)

    op.drop_index("ix_sms_outbound_messages_lock_expires_at", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_index("ix_sms_outbound_messages_status_next_attempt_at", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_index("ix_sms_outbound_messages_subscriber_id_created_at", table_name="sms_outbound_messages", schema=SCHEMA)
    op.drop_constraint("fk_sms_outbound_messages_delivered_by_webhook_event_id", "sms_outbound_messages", schema=SCHEMA, type_="foreignkey")
    op.drop_constraint("fk_sms_outbound_messages_subscriber_id", "sms_outbound_messages", schema=SCHEMA, type_="foreignkey")
    op.drop_column("sms_outbound_messages", "delivered_by_webhook_event_id", schema=SCHEMA)
    op.drop_column("sms_outbound_messages", "last_error_message", schema=SCHEMA)
    op.drop_column("sms_outbound_messages", "lock_expires_at", schema=SCHEMA)
    op.drop_column("sms_outbound_messages", "lock_token", schema=SCHEMA)
    op.drop_column("sms_outbound_messages", "next_attempt_at", schema=SCHEMA)
    op.drop_column("sms_outbound_messages", "subscriber_id", schema=SCHEMA)

