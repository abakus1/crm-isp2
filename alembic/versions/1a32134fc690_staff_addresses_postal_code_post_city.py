"""staff addresses: postal_code + post_city

Revision ID: 1a32134fc690
Revises: 16cc5269073c
Create Date: 2026-02-21 12:23:10.270349

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1a32134fc690'
down_revision: Union[str, Sequence[str], None] = '16cc5269073c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # Zameldowanie
    op.add_column(
        schema=schema,
        table_name="staff_users",
        column=sa.Column("address_registered_postal_code", sa.String(length=16), nullable=True),
    )
    op.add_column(
        schema=schema,
        table_name="staff_users",
        column=sa.Column("address_registered_post_city", sa.Text(), nullable=True),
    )

    # Zamieszkanie
    op.add_column(
        schema=schema,
        table_name="staff_users",
        column=sa.Column("address_current_postal_code", sa.String(length=16), nullable=True),
    )
    op.add_column(
        schema=schema,
        table_name="staff_users",
        column=sa.Column("address_current_post_city", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    schema = "crm"

    op.drop_column(schema=schema, table_name="staff_users", column_name="address_current_post_city")
    op.drop_column(schema=schema, table_name="staff_users", column_name="address_current_postal_code")
    op.drop_column(schema=schema, table_name="staff_users", column_name="address_registered_post_city")
    op.drop_column(schema=schema, table_name="staff_users", column_name="address_registered_postal_code")