"""add_payment_plan_item_idempotency_

Revision ID: ea209f5f84b2
Revises: f252a783382a
Create Date: 2026-02-23 13:44:21.727126

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ea209f5f84b2'
down_revision: Union[str, Sequence[str], None] = 'f252a783382a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # 1) payment_plan_items.idempotency_key (nullable)
    op.add_column(
        "payment_plan_items",
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        schema=SCHEMA,
    )

    # unikalny indeks częściowy: tylko gdy idempotency_key IS NOT NULL
    op.create_index(
        "uq_payment_plan_items_idempotency_key",
        "payment_plan_items",
        ["idempotency_key"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # 2) indeks pod applier: (status, effective_at)
    op.create_index(
        "ix_subscription_change_requests_status_effective_at",
        "subscription_change_requests",
        ["status", "effective_at"],
        unique=False,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_subscription_change_requests_status_effective_at",
        table_name="subscription_change_requests",
        schema=SCHEMA,
    )
    op.drop_index(
        "uq_payment_plan_items_idempotency_key",
        table_name="payment_plan_items",
        schema=SCHEMA,
    )
    op.drop_column("payment_plan_items", "idempotency_key", schema=SCHEMA)
