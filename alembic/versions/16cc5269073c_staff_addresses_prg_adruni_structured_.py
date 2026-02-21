"""staff addresses: PRG/ADRUNI structured fields

Revision ID: 16cc5269073c
Revises: a89aa0870d91
Create Date: 2026-02-20 19:40:30.029376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '16cc5269073c'
down_revision: Union[str, Sequence[str], None] = 'a89aa0870d91'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # Zameldowanie (registered)
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_place_name", sa.Text(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_terc", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_simc", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_street_name", sa.Text(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_ulic", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_building_no", sa.String(length=32), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered_prg_local_no", sa.String(length=32), nullable=True))

    # Zamieszkanie (current)
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_place_name", sa.Text(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_terc", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_simc", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_street_name", sa.Text(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_ulic", sa.String(length=8), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_building_no", sa.String(length=32), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current_prg_local_no", sa.String(length=32), nullable=True))


def downgrade() -> None:
    schema = "crm"

    op.drop_column("staff_users", "address_current_prg_local_no", schema=schema)
    op.drop_column("staff_users", "address_current_prg_building_no", schema=schema)
    op.drop_column("staff_users", "address_current_prg_ulic", schema=schema)
    op.drop_column("staff_users", "address_current_prg_street_name", schema=schema)
    op.drop_column("staff_users", "address_current_prg_simc", schema=schema)
    op.drop_column("staff_users", "address_current_prg_terc", schema=schema)
    op.drop_column("staff_users", "address_current_prg_place_name", schema=schema)

    op.drop_column("staff_users", "address_registered_prg_local_no", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_building_no", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_ulic", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_street_name", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_simc", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_terc", schema=schema)
    op.drop_column("staff_users", "address_registered_prg_place_name", schema=schema)