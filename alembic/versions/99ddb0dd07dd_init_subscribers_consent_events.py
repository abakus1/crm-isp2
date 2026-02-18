from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_init_subscribers_consents"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- subscribers (MVP) ---
    op.create_table(
        "subscribers",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),  # users.id z MMSA
        sa.Column("operational_status", sa.Text(), nullable=False),              # enum w app, tu TEXT
        sa.Column("accounting_status", sa.Text(), nullable=False),               # linked/missing/...
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        schema="crm",
    )

    op.create_index(
        "ix_subscribers_operational_status",
        "subscribers",
        ["operational_status"],
        schema="crm",
    )
    op.create_index(
        "ix_subscribers_accounting_status",
        "subscribers",
        ["accounting_status"],
        schema="crm",
    )

    # --- consent events (audit history) ---
    op.create_table(
        "consent_events",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("subscriber_id", sa.BigInteger(), nullable=False),
        sa.Column("consent_type", sa.Text(), nullable=False),   # rodo / efaktura / marketing
        sa.Column("state", sa.Boolean(), nullable=False),       # True=granted, False=revoked
        sa.Column("source", sa.Text(), nullable=False),         # panel / callcenter / staff / import
        sa.Column("actor_staff_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_user_id", sa.BigInteger(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ["subscriber_id"],
            ["crm.subscribers.id"],
            name="fk_consent_events_subscriber",
            ondelete="CASCADE",
        ),
        schema="crm",
    )

    op.create_index(
        "ix_consent_events_subscriber_type_time",
        "consent_events",
        ["subscriber_id", "consent_type", "occurred_at"],
        schema="crm",
    )

    # --- current consent view (latest event per subscriber + consent_type) ---
    op.execute(
        """
        CREATE OR REPLACE VIEW crm.v_consent_current AS
        SELECT DISTINCT ON (ce.subscriber_id, ce.consent_type)
            ce.subscriber_id,
            ce.consent_type,
            ce.state,
            ce.occurred_at,
            ce.source,
            ce.actor_staff_id,
            ce.actor_user_id,
            ce.meta
        FROM crm.consent_events ce
        ORDER BY ce.subscriber_id, ce.consent_type, ce.occurred_at DESC, ce.id DESC;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS crm.v_consent_current;")
    op.drop_index("ix_consent_events_subscriber_type_time", table_name="consent_events", schema="crm")
    op.drop_table("consent_events", schema="crm")

    op.drop_index("ix_subscribers_accounting_status", table_name="subscribers", schema="crm")
    op.drop_index("ix_subscribers_operational_status", table_name="subscribers", schema="crm")
    op.drop_table("subscribers", schema="crm")