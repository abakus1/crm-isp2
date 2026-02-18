"""prg: add x_1992 y_1992 for official points

Revision ID: 76540c6329c7
Revises: 64a532fa96c0
Create Date: 2026-02-18 22:24:35.185713

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '76540c6329c7'
down_revision: Union[str, Sequence[str], None] = '64a532fa96c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"
    op.add_column("prg_address_points", sa.Column("x_1992", sa.Integer(), nullable=True), schema=schema)
    op.add_column("prg_address_points", sa.Column("y_1992", sa.Integer(), nullable=True), schema=schema)

    op.create_index(
        "ix_prg_address_points_xy1992",
        "prg_address_points",
        ["x_1992", "y_1992"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = "crm"
    op.drop_index("ix_prg_address_points_xy1992", table_name="prg_address_points", schema=schema)
    op.drop_column("prg_address_points", "y_1992", schema=schema)
    op.drop_column("prg_address_points", "x_1992", schema=schema)