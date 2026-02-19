"""prg adruni building numbers

Revision ID: fe507b371ba5
Revises: 8fe2303958bd
Create Date: 2026-02-19 09:52:06.190386

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'fe507b371ba5'
down_revision: Union[str, Sequence[str], None] = '8fe2303958bd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    op.create_table(
        "prg_adruni_building_numbers",
        sa.Column("id", sa.BigInteger(), primary_key=True),

        sa.Column("terc", sa.String(length=8), nullable=False),
        sa.Column("simc", sa.String(length=8), nullable=False),
        sa.Column("ulic", sa.String(length=8), nullable=True),

        sa.Column("place_name", sa.Text(), nullable=True),
        sa.Column("street_name", sa.Text(), nullable=True),

        sa.Column("building_no", sa.String(length=32), nullable=False),
        sa.Column("building_no_norm", sa.String(length=32), nullable=False),

        # raw ADRUNI record (pipe-delimited or other format) – źródło prawdy
        sa.Column("adruni", sa.Text(), nullable=False),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),

        schema=schema,
    )

    # Unique: ulic != NULL
    op.create_index(
        "uq_prg_adruni_key_with_ulic",
        "prg_adruni_building_numbers",
        ["terc", "simc", "ulic", "building_no_norm"],
        unique=True,
        schema=schema,
        postgresql_where=sa.text("ulic IS NOT NULL"),
    )

    # Unique: ulic == NULL (no-street / streetless areas)
    op.create_index(
        "uq_prg_adruni_key_no_ulic",
        "prg_adruni_building_numbers",
        ["terc", "simc", "building_no_norm"],
        unique=True,
        schema=schema,
        postgresql_where=sa.text("ulic IS NULL"),
    )

    op.create_index(
        "ix_prg_adruni_lookup",
        "prg_adruni_building_numbers",
        ["terc", "simc", "ulic", "building_no_norm"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = "crm"

    op.drop_index("ix_prg_adruni_lookup", table_name="prg_adruni_building_numbers", schema=schema)
    op.drop_index("uq_prg_adruni_key_no_ulic", table_name="prg_adruni_building_numbers", schema=schema)
    op.drop_index("uq_prg_adruni_key_with_ulic", table_name="prg_adruni_building_numbers", schema=schema)
    op.drop_table("prg_adruni_building_numbers", schema=schema)