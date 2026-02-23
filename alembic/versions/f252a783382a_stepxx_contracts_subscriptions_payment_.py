"""stepXX_contracts_subscriptions_payment_plan_foundation

Revision ID: f252a783382a
Revises: 74850a0a29e7
Create Date: 2026-02-23 09:45:20.232490

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f252a783382a'
down_revision: Union[str, Sequence[str], None] = '74850a0a29e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # ---------------------------
    # ENUM TYPES (schema-local)
    # ---------------------------
    payment_plan_item_type = postgresql.ENUM(
        # cykliczna opłata abonamentowa za okres rozliczeniowy (miesiąc kalendarzowy)
        "recurring_monthly",
        # jednorazowa opłata aktywacyjna / instalacyjna
        "activation_fee",
        # naliczenie proporcjonalne (30-dniowe) dla startu/zmiany w trakcie miesiąca
        "prorata",
        # korekta (np. wyrównanie, ręczny adjustment – w przyszłości)
        "adjustment",
        # rabat (w przyszłości: zgody, promocje)
        "discount",
        name="payment_plan_item_type",
        schema=SCHEMA,
        create_type=False,
    )

    payment_plan_item_status = postgresql.ENUM(
        "planned",     # zaplanowane do fakturowania
        "invoiced",    # powiązane z dokumentem księgowym
        "cancelled",   # anulowane (np. po zmianie planu)
        name="payment_plan_item_status",
        schema=SCHEMA,
        create_type=False,
    )

    subscription_change_type = postgresql.ENUM(
        "upgrade",
        "downgrade",
        "terminate",
        "suspend",
        "resume",
        name="subscription_change_type",
        schema=SCHEMA,
        create_type=False,
    )

    subscription_change_status = postgresql.ENUM(
        "pending",
        "applied",
        "cancelled",
        "rejected",
        name="subscription_change_status",
        schema=SCHEMA,
        create_type=False,
    )

    account_access_status = postgresql.ENUM(
        "pending",
        "active",
        "disabled",
        name="account_access_status",
        schema=SCHEMA,
        create_type=False,
    )

    payment_plan_item_type.create(op.get_bind(), checkfirst=True)
    payment_plan_item_status.create(op.get_bind(), checkfirst=True)
    subscription_change_type.create(op.get_bind(), checkfirst=True)
    subscription_change_status.create(op.get_bind(), checkfirst=True)
    account_access_status.create(op.get_bind(), checkfirst=True)

    # ---------------------------
    # subscription_change_requests
    # ---------------------------
    op.create_table(
        "subscription_change_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),

        sa.Column(
            "subscription_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),

        # kto zainicjował (na razie staff; klientowy portal dojdzie później)
        sa.Column(
            "requested_by_staff_user_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("change_type", subscription_change_type, nullable=False),
        sa.Column("status", subscription_change_status, nullable=False, server_default="pending"),

        # kiedy zmiana ma wejść w życie (np. downgrade od 1. dnia miesiąca)
        sa.Column("effective_at", sa.Date(), nullable=False),

        # payload na przyszłość (np. new_tariff_id, new_price_snapshot, reason, itd.)
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),

        sa.Column("note", sa.Text(), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sub_change_requests_subscription_id",
        "subscription_change_requests",
        ["subscription_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sub_change_requests_status",
        "subscription_change_requests",
        ["status"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_sub_change_requests_effective_at",
        "subscription_change_requests",
        ["effective_at"],
        schema=SCHEMA,
    )

    # ---------------------------
    # payment_plan_items
    # ---------------------------
    op.create_table(
        "payment_plan_items",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),

        sa.Column(
            "contract_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "subscription_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("item_type", payment_plan_item_type, nullable=False),
        sa.Column("status", payment_plan_item_status, nullable=False, server_default="planned"),

        # okres świadczenia/usługi, którego dotyczy pozycja (dla proraty może być część miesiąca)
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),

        # “miesiąc fakturowania” jako pierwszy dzień miesiąca (łatwe grupowanie i idempotencja)
        sa.Column("billing_month", sa.Date(), nullable=False),

        sa.Column("amount_net", sa.Numeric(12, 2), nullable=False),
        sa.Column("vat_rate", sa.Numeric(5, 2), nullable=False, server_default=sa.text("0.00")),
        sa.Column("amount_gross", sa.Numeric(12, 2), nullable=False),

        sa.Column("currency", sa.String(length=3), nullable=False, server_default="PLN"),
        sa.Column("description", sa.Text(), nullable=True),

        # meta do integracji księgowej później (Optima/KSeF)
        sa.Column("external_document_id", sa.String(length=128), nullable=True),

        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_payment_plan_items_contract_id",
        "payment_plan_items",
        ["contract_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_payment_plan_items_subscription_id",
        "payment_plan_items",
        ["subscription_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_payment_plan_items_billing_month",
        "payment_plan_items",
        ["billing_month"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_payment_plan_items_status",
        "payment_plan_items",
        ["status"],
        schema=SCHEMA,
    )

    # Guard idempotency dla generatorów (np. recurring za dany contract + miesiąc)
    op.create_index(
        "ix_payment_plan_items_contract_month_type",
        "payment_plan_items",
        ["contract_id", "billing_month", "item_type"],
        unique=False,
        schema=SCHEMA,
    )

    # ---------------------------
    # account_access (minimal)
    # ---------------------------
    op.create_table(
        "account_access",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),

        sa.Column(
            "subscriber_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="CASCADE"),
            nullable=False,
        ),

        # placeholder: identity_user_id (np. UUID z przyszłego modułu klienta)
        sa.Column("identity_user_id", postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column("status", account_access_status, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_account_access_subscriber_id",
        "account_access",
        ["subscriber_id"],
        unique=True,
        schema=SCHEMA,
    )
    op.create_index(
        "ix_account_access_status",
        "account_access",
        ["status"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    # drop tables first (FK deps)
    op.drop_index("ix_account_access_status", table_name="account_access", schema=SCHEMA)
    op.drop_index("uq_account_access_subscriber_id", table_name="account_access", schema=SCHEMA)
    op.drop_table("account_access", schema=SCHEMA)

    op.drop_index("ix_payment_plan_items_contract_month_type", table_name="payment_plan_items", schema=SCHEMA)
    op.drop_index("ix_payment_plan_items_status", table_name="payment_plan_items", schema=SCHEMA)
    op.drop_index("ix_payment_plan_items_billing_month", table_name="payment_plan_items", schema=SCHEMA)
    op.drop_index("ix_payment_plan_items_subscription_id", table_name="payment_plan_items", schema=SCHEMA)
    op.drop_index("ix_payment_plan_items_contract_id", table_name="payment_plan_items", schema=SCHEMA)
    op.drop_table("payment_plan_items", schema=SCHEMA)

    op.drop_index("ix_sub_change_requests_effective_at", table_name="subscription_change_requests", schema=SCHEMA)
    op.drop_index("ix_sub_change_requests_status", table_name="subscription_change_requests", schema=SCHEMA)
    op.drop_index("ix_sub_change_requests_subscription_id", table_name="subscription_change_requests", schema=SCHEMA)
    op.drop_table("subscription_change_requests", schema=SCHEMA)

    # drop enums last
    account_access_status = postgresql.ENUM(name="account_access_status", schema=SCHEMA)
    subscription_change_status = postgresql.ENUM(name="subscription_change_status", schema=SCHEMA)
    subscription_change_type = postgresql.ENUM(name="subscription_change_type", schema=SCHEMA)
    payment_plan_item_status = postgresql.ENUM(name="payment_plan_item_status", schema=SCHEMA)
    payment_plan_item_type = postgresql.ENUM(name="payment_plan_item_type", schema=SCHEMA)

    account_access_status.drop(op.get_bind(), checkfirst=True)
    subscription_change_status.drop(op.get_bind(), checkfirst=True)
    subscription_change_type.drop(op.get_bind(), checkfirst=True)
    payment_plan_item_status.drop(op.get_bind(), checkfirst=True)
    payment_plan_item_type.drop(op.get_bind(), checkfirst=True)
