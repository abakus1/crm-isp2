"""pricing_schedule_foundation

Revision ID: c53ec804a23c
Revises: ea209f5f84b2
Create Date: 2026-02-23 16:03:39.683645

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c53ec804a23c"
down_revision: Union[str, Sequence[str], None] = "ea209f5f84b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "crm"


def _create_enum_if_not_exists(schema: str, name: str, values: list[str]) -> None:
    # Values must be double-quoted inside EXECUTE string: ''internet'' -> becomes 'internet'
    vals_sql = ", ".join([f"''{v}''" for v in values])

    op.execute(
        f"""
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = '{name}' AND n.nspname = '{schema}'
    ) THEN
        EXECUTE 'CREATE TYPE {schema}.{name} AS ENUM ({vals_sql})';
    END IF;
END
$$;
"""
    )


def upgrade() -> None:
    # --- ENUMs (guarded) ---
    _create_enum_if_not_exists(
        schema=SCHEMA,
        name="catalog_product_type",
        values=["internet", "tv", "voip", "addon"],
    )
    _create_enum_if_not_exists(
        schema=SCHEMA,
        name="price_schedule_source",
        values=["catalog", "contract_post_term", "contract_annual", "manual"],
    )

    # --- contracts pricing terms ---
    op.add_column(
        "contracts",
        sa.Column("post_term_increase_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema=SCHEMA,
    )
    op.add_column(
        "contracts",
        sa.Column("post_term_increase_amount", sa.Numeric(12, 2), nullable=True),
        schema=SCHEMA,
    )

    op.add_column(
        "contracts",
        sa.Column("annual_increase_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        schema=SCHEMA,
    )
    op.add_column(
        "contracts",
        sa.Column("annual_increase_amount", sa.Numeric(12, 2), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "contracts",
        sa.Column("annual_increase_every_months", sa.Integer(), nullable=False, server_default=sa.text("12")),
        schema=SCHEMA,
    )

    op.add_column(
        "contracts",
        sa.Column("price_schedule_horizon_months", sa.Integer(), nullable=False, server_default=sa.text("120")),
        schema=SCHEMA,
    )

    # Drop server defaults after migration (keeps model clean)
    op.alter_column("contracts", "post_term_increase_enabled", server_default=None, schema=SCHEMA)
    op.alter_column("contracts", "annual_increase_enabled", server_default=None, schema=SCHEMA)
    op.alter_column("contracts", "annual_increase_every_months", server_default=None, schema=SCHEMA)
    op.alter_column("contracts", "price_schedule_horizon_months", server_default=None, schema=SCHEMA)

    # --- subscriptions: primary flag (main services) ---
    # This enables "Zakładka Usługi": you can mark each subscription as main/extra per contract.
    op.add_column(
        "subscriptions",
        sa.Column("is_primary", sa.Boolean(), nullable=True),
        schema=SCHEMA,
    )

    # Backfill default:
    # - addon -> false
    # - everything else -> true
    # If your schema uses different column name than "type" (e.g. subscription_type), adjust this UPDATE.
    op.execute(
        """
UPDATE crm.subscriptions
SET is_primary = CASE WHEN type = 'addon' THEN false ELSE true END
WHERE is_primary IS NULL
"""
    )

    op.alter_column("subscriptions", "is_primary", nullable=False, schema=SCHEMA)
    op.create_index(
        "ix_subscriptions_contract_primary",
        "subscriptions",
        ["contract_id", "is_primary"],
        schema=SCHEMA,
    )

    # --- catalog_products ---
    catalog_product_type_enum = postgresql.ENUM(
        "internet",
        "tv",
        "voip",
        "addon",
        name="catalog_product_type",
        schema=SCHEMA,
        create_type=False,
    )

    op.create_table(
        "catalog_products",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("product_type", catalog_product_type_enum, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_catalog_products_code"),
        schema=SCHEMA,
    )
    op.alter_column("catalog_products", "is_active", server_default=None, schema=SCHEMA)

    # --- catalog_price_schedule_events ---
    price_schedule_source_enum = postgresql.ENUM(
        "catalog",
        "contract_post_term",
        "contract_annual",
        "manual",
        name="price_schedule_source",
        schema=SCHEMA,
        create_type=False,
    )

    op.create_table(
        "catalog_price_schedule_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("catalog_product_id", sa.Integer(), nullable=False),
        sa.Column("effective_month", sa.Date(), nullable=False),  # first day of month
        sa.Column("monthly_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("activation_fee", sa.Numeric(12, 2), nullable=True),
        sa.Column("source", price_schedule_source_enum, nullable=False, server_default=sa.text("'catalog'")),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["catalog_product_id"],
            [f"{SCHEMA}.catalog_products.id"],
            name="fk_catalog_price_schedule_events_product",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("date_trunc('month', effective_month) = effective_month", name="ck_catalog_schedule_month_boundary"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_catalog_price_schedule_events_product_month",
        "catalog_price_schedule_events",
        ["catalog_product_id", "effective_month"],
        unique=True,
        schema=SCHEMA,
    )
    op.alter_column("catalog_price_schedule_events", "source", server_default=None, schema=SCHEMA)

    # --- subscription_price_schedule_events (snapshot per subscription) ---
    op.create_table(
        "subscription_price_schedule_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("subscription_id", sa.BigInteger(), nullable=False),
        sa.Column("effective_month", sa.Date(), nullable=False),  # first day of month
        sa.Column("monthly_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("source", price_schedule_source_enum, nullable=False, server_default=sa.text("'manual'")),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            [f"{SCHEMA}.subscriptions.id"],
            name="fk_subscription_price_schedule_events_subscription",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("date_trunc('month', effective_month) = effective_month", name="ck_subscription_schedule_month_boundary"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_subscription_price_schedule_events_subscription_month",
        "subscription_price_schedule_events",
        ["subscription_id", "effective_month"],
        unique=True,
        schema=SCHEMA,
    )
    op.alter_column("subscription_price_schedule_events", "source", server_default=None, schema=SCHEMA)


def downgrade() -> None:
    # drop new tables first (safe)
    op.drop_index(
        "ix_subscription_price_schedule_events_subscription_month",
        table_name="subscription_price_schedule_events",
        schema=SCHEMA,
    )
    op.drop_table("subscription_price_schedule_events", schema=SCHEMA)

    op.drop_index(
        "ix_catalog_price_schedule_events_product_month",
        table_name="catalog_price_schedule_events",
        schema=SCHEMA,
    )
    op.drop_table("catalog_price_schedule_events", schema=SCHEMA)

    op.drop_table("catalog_products", schema=SCHEMA)

    # subscriptions primary flag
    op.drop_index("ix_subscriptions_contract_primary", table_name="subscriptions", schema=SCHEMA)
    op.drop_column("subscriptions", "is_primary", schema=SCHEMA)

    # remove contract columns
    op.drop_column("contracts", "price_schedule_horizon_months", schema=SCHEMA)
    op.drop_column("contracts", "annual_increase_every_months", schema=SCHEMA)
    op.drop_column("contracts", "annual_increase_amount", schema=SCHEMA)
    op.drop_column("contracts", "annual_increase_enabled", schema=SCHEMA)
    op.drop_column("contracts", "post_term_increase_amount", schema=SCHEMA)
    op.drop_column("contracts", "post_term_increase_enabled", schema=SCHEMA)

    # IMPORTANT: we DO NOT drop ENUM types here on purpose.
    # They may be referenced by other objects or future migrations.