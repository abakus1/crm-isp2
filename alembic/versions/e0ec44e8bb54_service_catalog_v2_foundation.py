"""service_catalog_v2_foundation

Revision ID: c9a1f2d3e4b5
Revises: f252a783382a
Create Date: 2026-02-23 18:00:00

Nowa oś katalogu usług:
Service Family → Contract Term → Service Plan

+ pricing per miesiąc (1..X)
+ post-term policy (podwyżki do 10 lat)
+ requirements (addon)
+ dependencies między planami

UWAGA:
Nie ruszamy istniejącego billing layer.
ServicePlan mapuje się do istniejącego crm.catalog_products.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e0ec44e8bb54'
down_revision: Union[str, Sequence[str], None] = 'b0b5db14fcba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "crm"


def upgrade() -> None:

    # =====================================================
    # SERVICE FAMILIES (hierarchiczne)
    # =====================================================
    op.create_table(
        "service_families",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            [f"{SCHEMA}.service_families.id"],
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint("code", name="uq_service_families_code"),
        schema=SCHEMA,
    )

    # =====================================================
    # CONTRACT TERMS
    # =====================================================
    op.create_table(
        "contract_terms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("months", sa.Integer(), nullable=True),  # NULL = czas nieokreślony
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.UniqueConstraint("name", name="uq_contract_terms_name"),
        schema=SCHEMA,
    )

    # =====================================================
    # SERVICE PLANS
    # =====================================================
    op.create_table(
        "service_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("contract_term_id", sa.Integer(), nullable=False),

        # MAPOWANIE DO ISTNIEJĄCEGO BILLING
        sa.Column("billing_catalog_product_id", sa.Integer(), nullable=False),

        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_addon", sa.Boolean(), nullable=False, server_default=sa.text("false")),

        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),

        sa.ForeignKeyConstraint(
            ["family_id"],
            [f"{SCHEMA}.service_families.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["contract_term_id"],
            [f"{SCHEMA}.contract_terms.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["billing_catalog_product_id"],
            [f"{SCHEMA}.catalog_products.id"],
            ondelete="RESTRICT",
        ),

        sa.UniqueConstraint("code", name="uq_service_plans_code"),
        schema=SCHEMA,
    )

    # =====================================================
    # PRICING 1..X (per miesiąc)
    # =====================================================
    op.create_table(
        "service_plan_month_prices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_plan_id", sa.Integer(), nullable=False),
        sa.Column("month_no", sa.Integer(), nullable=False),
        sa.Column("price_net", sa.Numeric(12, 2), nullable=False),

        sa.ForeignKeyConstraint(
            ["service_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),

        sa.UniqueConstraint(
            "service_plan_id",
            "month_no",
            name="uq_service_plan_month_prices_unique",
        ),
        schema=SCHEMA,
    )

    # =====================================================
    # POST-TERM POLICY (podwyżki)
    # =====================================================
    op.create_table(
        "service_plan_post_term_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_plan_id", sa.Integer(), nullable=False),
        sa.Column("increase_mode", sa.String(length=20), nullable=False),  # percent / fixed
        sa.Column("increase_value", sa.Numeric(12, 4), nullable=False),
        sa.Column("recurrence_months", sa.Integer(), nullable=False),
        sa.Column("max_years", sa.Integer(), nullable=False, server_default="10"),

        sa.ForeignKeyConstraint(
            ["service_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),
        schema=SCHEMA,
    )

    # =====================================================
    # REQUIREMENTS (addon wymagany)
    # =====================================================
    op.create_table(
        "service_plan_requirements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_plan_id", sa.Integer(), nullable=False),
        sa.Column("required_plan_id", sa.Integer(), nullable=False),

        sa.ForeignKeyConstraint(
            ["service_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["required_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),

        sa.UniqueConstraint(
            "service_plan_id",
            "required_plan_id",
            name="uq_service_plan_requirements_unique",
        ),
        schema=SCHEMA,
    )

    # =====================================================
    # DEPENDENCIES (zależności między głównymi)
    # =====================================================
    op.create_table(
        "service_plan_dependencies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("service_plan_id", sa.Integer(), nullable=False),
        sa.Column("depends_on_plan_id", sa.Integer(), nullable=False),

        sa.ForeignKeyConstraint(
            ["service_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["depends_on_plan_id"],
            [f"{SCHEMA}.service_plans.id"],
            ondelete="CASCADE",
        ),

        sa.UniqueConstraint(
            "service_plan_id",
            "depends_on_plan_id",
            name="uq_service_plan_dependencies_unique",
        ),
        schema=SCHEMA,
    )


def downgrade() -> None:

    op.drop_table("service_plan_dependencies", schema=SCHEMA)
    op.drop_table("service_plan_requirements", schema=SCHEMA)
    op.drop_table("service_plan_post_term_policies", schema=SCHEMA)
    op.drop_table("service_plan_month_prices", schema=SCHEMA)
    op.drop_table("service_plans", schema=SCHEMA)
    op.drop_table("contract_terms", schema=SCHEMA)
    op.drop_table("service_families", schema=SCHEMA)