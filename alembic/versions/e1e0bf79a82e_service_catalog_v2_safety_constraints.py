"""service_catalog_v2_safety_constraints

Revision ID: e1e0bf79a82e
Revises: e0ec44e8bb54
Create Date: 2026-02-23 22:09:24.883489

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1e0bf79a82e'
down_revision: Union[str, Sequence[str], None] = 'e0ec44e8bb54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # 1) primary i addon nie mogą być jednocześnie
    op.create_check_constraint(
        "ck_service_plans_not_primary_and_addon",
        "service_plans",
        "NOT (is_primary AND is_addon)",
        schema=SCHEMA,
    )

    # 2) requirements: brak self-loop
    op.create_check_constraint(
        "ck_service_plan_requirements_no_self_loop",
        "service_plan_requirements",
        "service_plan_id <> required_plan_id",
        schema=SCHEMA,
    )

    # 3) dependencies: brak self-loop
    op.create_check_constraint(
        "ck_service_plan_dependencies_no_self_loop",
        "service_plan_dependencies",
        "service_plan_id <> depends_on_plan_id",
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_service_plan_dependencies_no_self_loop",
        "service_plan_dependencies",
        schema=SCHEMA,
        type_="check",
    )
    op.drop_constraint(
        "ck_service_plan_requirements_no_self_loop",
        "service_plan_requirements",
        schema=SCHEMA,
        type_="check",
    )
    op.drop_constraint(
        "ck_service_plans_not_primary_and_addon",
        "service_plans",
        schema=SCHEMA,
        type_="check",
    )
