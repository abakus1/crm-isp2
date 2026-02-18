"""prg import files + action

Revision ID: 64a532fa96c0
Revises: 87f6fcbd1914
Create Date: 2026-02-18 22:06:41.063393

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '64a532fa96c0'
down_revision: Union[str, Sequence[str], None] = '87f6fcbd1914'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # -------------------------
    # prg_import_files
    # -------------------------
    op.create_table(
        "prg_import_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("mode", sa.String(length=16), nullable=False),  # full|delta
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("checksum", sa.String(length=128), nullable=False),
        sa.Column("rows_inserted", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("rows_updated", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=schema,
    )

    op.create_index("uq_prg_import_files_checksum", "prg_import_files", ["checksum"], unique=True, schema=schema)
    op.create_index("ix_prg_import_files_created_at", "prg_import_files", ["created_at"], unique=False, schema=schema)

    # -------------------------
    # RBAC action prg.import.run (missing in previous migration)
    # -------------------------
    op.execute(
        sa.text(
            f"""
            INSERT INTO {schema}.rbac_actions (code, label_pl, description_pl)
            VALUES (:code, :label, :desc)
            ON CONFLICT (code) DO NOTHING
            """
        ).bindparams(
            code="prg.import.run",
            label="PRG: uruchom import",
            desc="Pozwala uruchomić import PRG z pliku (full/delta) oraz wykonać auto-reconcile.",
        )
    )

    # Admin always gets it
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code = 'prg.import.run'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    schema = "crm"

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_role_actions
        WHERE action_id = (SELECT id FROM {schema}.rbac_actions WHERE code='prg.import.run');
        """
    )
    op.execute(f"DELETE FROM {schema}.rbac_actions WHERE code='prg.import.run';")

    op.drop_index("ix_prg_import_files_created_at", table_name="prg_import_files", schema=schema)
    op.drop_index("uq_prg_import_files_checksum", table_name="prg_import_files", schema=schema)
    op.drop_table("prg_import_files", schema=schema)