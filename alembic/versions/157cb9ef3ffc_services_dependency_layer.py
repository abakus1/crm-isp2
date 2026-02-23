"""services_dependency_layer

Revision ID: 157cb9ef3ffc
Revises: c53ec804a23c
Create Date: 2026-02-23 18:28:13.101841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '157cb9ef3ffc'
down_revision: Union[str, Sequence[str], None] = 'c53ec804a23c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -------------------------------------------
    # subscriptions.parent_subscription_id
    # -------------------------------------------
    op.add_column(
        "subscriptions",
        sa.Column(
            "parent_subscription_id",
            sa.BigInteger(),
            nullable=True,
        ),
        schema="crm",
    )

    op.create_foreign_key(
        "fk_subscriptions_parent_subscription",
        "subscriptions",
        "subscriptions",
        ["parent_subscription_id"],
        ["id"],
        source_schema="crm",
        referent_schema="crm",
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_subscriptions_parent_subscription_id",
        "subscriptions",
        ["parent_subscription_id"],
        schema="crm",
    )

    # -------------------------------------------
    # catalog_product_requirements
    # -------------------------------------------
    op.create_table(
        "catalog_product_requirements",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "primary_product_id",
            sa.BigInteger(),
            sa.ForeignKey("crm.catalog_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "required_product_id",
            sa.BigInteger(),
            sa.ForeignKey("crm.catalog_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("min_qty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("max_qty", sa.Integer(), nullable=True),
        sa.Column("is_hard_required", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        schema="crm",
    )

    op.create_index(
        "ix_catalog_product_requirements_primary",
        "catalog_product_requirements",
        ["primary_product_id"],
        schema="crm",
    )

    op.create_index(
        "ix_catalog_product_requirements_required",
        "catalog_product_requirements",
        ["required_product_id"],
        schema="crm",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_catalog_product_requirements_required",
        table_name="catalog_product_requirements",
        schema="crm",
    )

    op.drop_index(
        "ix_catalog_product_requirements_primary",
        table_name="catalog_product_requirements",
        schema="crm",
    )

    op.drop_table("catalog_product_requirements", schema="crm")

    op.drop_index(
        "ix_subscriptions_parent_subscription_id",
        table_name="subscriptions",
        schema="crm",
    )

    op.drop_constraint(
        "fk_subscriptions_parent_subscription",
        "subscriptions",
        schema="crm",
        type_="foreignkey",
    )

    op.drop_column("subscriptions", "parent_subscription_id", schema="crm")