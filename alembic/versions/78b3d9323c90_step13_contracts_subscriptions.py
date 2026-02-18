"""step13 contracts + subscriptions

Revision ID: 78b3d9323c90
Revises: 35d6253f7bb9
Create Date: 2026-02-10 15:02:03.990930

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '78b3d9323c90'
down_revision: Union[str, Sequence[str], None] = '35d6253f7bb9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # ---------------------------
    # ENUM TYPES (schema-local)
    # ---------------------------
    contract_status = postgresql.ENUM(
        "inactive",        # umowa podpisana, ale usługi jeszcze nie uruchomione
        "active",
        "suspended",
        "blocked",
        "to_terminate",
        "debt_collection",
        "archived",
        name="contract_status",
        schema=SCHEMA,
        create_type=False,
    )

    subscription_type = postgresql.ENUM(
        "internet",
        "tv",
        "voip",
        "addon",
        name="subscription_type",
        schema=SCHEMA,
        create_type=False,
    )

    subscription_status = postgresql.ENUM(
        "pending",         # utworzone, oczekuje na provisioning/aktywację
        "active",
        "suspended",
        "blocked",
        "terminated",
        "archived",
        name="subscription_status",
        schema=SCHEMA,
        create_type=False,
    )

    contract_status.create(op.get_bind(), checkfirst=True)
    subscription_type.create(op.get_bind(), checkfirst=True)
    subscription_status.create(op.get_bind(), checkfirst=True)

    # ---------------------------
    # contracts (umowy / kontrakty)
    # ---------------------------
    op.create_table(
        "contracts",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "subscriber_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("contract_no", sa.String(length=64), nullable=False),
        sa.Column("status", contract_status, nullable=False, server_default="inactive"),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_end_at", sa.DateTime(timezone=True), nullable=True),

        # Warunki umowy (MVP: tylko kluczowe pola)
        sa.Column("is_indefinite", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("term_months", sa.Integer(), nullable=True),          # gdy umowa terminowa
        sa.Column("notice_days", sa.Integer(), nullable=True),          # np. 30 dla nieokreślonej
        sa.Column("billing_day", sa.Integer(), nullable=False, server_default="1"),  # 1..28

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        sa.UniqueConstraint("contract_no", name="uq_contracts_contract_no"),
        schema=SCHEMA,
    )
    op.create_index("ix_contracts_subscriber_id", "contracts", ["subscriber_id"], schema=SCHEMA)
    op.create_index("ix_contracts_status", "contracts", ["status"], schema=SCHEMA)

    # ---------------------------
    # contract_versions (snapshot JSONB)
    #  - dokumenty księgowe zawsze wskazują snapshot (tu: wersja umowy)
    # ---------------------------
    op.create_table(
        "contract_versions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "contract_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_staff_id", sa.BigInteger(), nullable=True),
        sa.UniqueConstraint("contract_id", "version_no", name="uq_contract_versions_contract_ver"),
        schema=SCHEMA,
    )
    op.create_index("ix_contract_versions_contract_id", "contract_versions", ["contract_id"], schema=SCHEMA)
    op.create_index("ix_contract_versions_created_at", "contract_versions", ["created_at"], schema=SCHEMA)

    op.execute(
        f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_contract_current AS
        SELECT
            c.id AS contract_id,
            c.subscriber_id,
            c.contract_no,
            c.status AS contract_status,
            c.signed_at,
            c.service_start_at,
            c.service_end_at,
            c.is_indefinite,
            c.term_months,
            c.notice_days,
            c.billing_day,
            c.created_at AS contract_created_at,
            c.updated_at AS contract_updated_at,
            v.id AS contract_version_id,
            v.version_no,
            v.snapshot,
            v.created_at AS version_created_at
        FROM {SCHEMA}.contracts c
        JOIN LATERAL (
            SELECT *
            FROM {SCHEMA}.contract_versions v
            WHERE v.contract_id = c.id
            ORDER BY v.version_no DESC
            LIMIT 1
        ) v ON TRUE;
        """
    )

    # ---------------------------
    # subscriptions (subskrypcje = usługi + billing loop)
    # ---------------------------
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "contract_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", subscription_type, nullable=False),
        sa.Column("status", subscription_status, nullable=False, server_default="pending"),

        # Wskazania do katalogu (na razie stringi, później FK do katalogu taryf/produktów)
        sa.Column("product_code", sa.String(length=80), nullable=True),
        sa.Column("tariff_code", sa.String(length=80), nullable=True),

        # Billing
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("price_override", sa.Numeric(10, 2), nullable=True),
        sa.Column("billing_period_months", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("next_billing_at", sa.DateTime(timezone=True), nullable=True),

        # Adres instalacji (opcjonalny na start)
        sa.Column(
            "service_address_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.service_addresses.id", ondelete="RESTRICT"),
            nullable=True,
        ),

        # provisioning hooks (MVP: JSONB na referencje do adapterów)
        sa.Column("provisioning", postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        sa.Column("service_start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("service_end_at", sa.DateTime(timezone=True), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index("ix_subscriptions_contract_id", "subscriptions", ["contract_id"], schema=SCHEMA)
    op.create_index("ix_subscriptions_status", "subscriptions", ["status"], schema=SCHEMA)
    op.create_index("ix_subscriptions_type", "subscriptions", ["type"], schema=SCHEMA)

    # ---------------------------
    # subscription_versions (snapshot JSONB)
    # ---------------------------
    op.create_table(
        "subscription_versions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "subscription_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_staff_id", sa.BigInteger(), nullable=True),
        sa.UniqueConstraint("subscription_id", "version_no", name="uq_subscription_versions_sub_ver"),
        schema=SCHEMA,
    )
    op.create_index("ix_subscription_versions_subscription_id", "subscription_versions", ["subscription_id"], schema=SCHEMA)
    op.create_index("ix_subscription_versions_created_at", "subscription_versions", ["created_at"], schema=SCHEMA)

    op.execute(
        f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_subscription_current AS
        SELECT
            s.id AS subscription_id,
            s.contract_id,
            s.type AS subscription_type,
            s.status AS subscription_status,
            s.product_code,
            s.tariff_code,
            s.quantity,
            s.price_override,
            s.billing_period_months,
            s.next_billing_at,
            s.service_address_id,
            s.provisioning,
            s.service_start_at,
            s.service_end_at,
            s.created_at AS subscription_created_at,
            s.updated_at AS subscription_updated_at,
            v.id AS subscription_version_id,
            v.version_no,
            v.snapshot,
            v.created_at AS version_created_at
        FROM {SCHEMA}.subscriptions s
        JOIN LATERAL (
            SELECT *
            FROM {SCHEMA}.subscription_versions v
            WHERE v.subscription_id = s.id
            ORDER BY v.version_no DESC
            LIMIT 1
        ) v ON TRUE;
        """
    )


def downgrade() -> None:
    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_subscription_current;")

    op.drop_index("ix_subscription_versions_created_at", table_name="subscription_versions", schema=SCHEMA)
    op.drop_index("ix_subscription_versions_subscription_id", table_name="subscription_versions", schema=SCHEMA)
    op.drop_table("subscription_versions", schema=SCHEMA)

    op.drop_index("ix_subscriptions_type", table_name="subscriptions", schema=SCHEMA)
    op.drop_index("ix_subscriptions_status", table_name="subscriptions", schema=SCHEMA)
    op.drop_index("ix_subscriptions_contract_id", table_name="subscriptions", schema=SCHEMA)
    op.drop_table("subscriptions", schema=SCHEMA)

    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_contract_current;")

    op.drop_index("ix_contract_versions_created_at", table_name="contract_versions", schema=SCHEMA)
    op.drop_index("ix_contract_versions_contract_id", table_name="contract_versions", schema=SCHEMA)
    op.drop_table("contract_versions", schema=SCHEMA)

    op.drop_index("ix_contracts_status", table_name="contracts", schema=SCHEMA)
    op.drop_index("ix_contracts_subscriber_id", table_name="contracts", schema=SCHEMA)
    op.drop_table("contracts", schema=SCHEMA)

    # Drop ENUM types
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.subscription_status;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.subscription_type;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.contract_status;")