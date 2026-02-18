"""staff status archived + disable/archive metadata

Revision ID: 3bb3d7325309
Revises: f3e8e2e013bf
Create Date: 2026-02-13 20:47:41.707944

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3bb3d7325309"
down_revision: Union[str, Sequence[str], None] = "f3e8e2e013bf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "crm"


def upgrade() -> None:
    # 1) Extend enum crm.staff_status with 'archived'
    op.execute("ALTER TYPE crm.staff_status ADD VALUE IF NOT EXISTS 'archived'")

    # 2) Add operational metadata columns to crm.staff_users
    op.add_column(
        "staff_users",
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "staff_users",
        sa.Column("disabled_reason", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "staff_users",
        sa.Column("disabled_source", sa.String(length=32), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "staff_users",
        sa.Column("disabled_by_staff_user_id", sa.BigInteger(), nullable=True),
        schema=SCHEMA,
    )

    op.add_column(
        "staff_users",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "staff_users",
        sa.Column("archived_reason", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "staff_users",
        sa.Column("archived_by_staff_user_id", sa.BigInteger(), nullable=True),
        schema=SCHEMA,
    )

    # 3) Foreign keys: *_by_staff_user_id -> crm.staff_users.id (ON DELETE SET NULL)
    op.create_foreign_key(
        "fk_staff_users_disabled_by_staff_user_id",
        source_table="staff_users",
        referent_table="staff_users",
        local_cols=["disabled_by_staff_user_id"],
        remote_cols=["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )

    op.create_foreign_key(
        "fk_staff_users_archived_by_staff_user_id",
        source_table="staff_users",
        referent_table="staff_users",
        local_cols=["archived_by_staff_user_id"],
        remote_cols=["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )

    # 4) Indices (idempotent)
    op.execute("CREATE INDEX IF NOT EXISTS ix_staff_users_status ON crm.staff_users (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_staff_users_disabled_at ON crm.staff_users (disabled_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_staff_users_archived_at ON crm.staff_users (archived_at)")


def downgrade() -> None:
    # Drop indices safely (may have existed before this migration)
    op.execute("DROP INDEX IF EXISTS crm.ix_staff_users_archived_at")
    op.execute("DROP INDEX IF EXISTS crm.ix_staff_users_disabled_at")
    op.execute("DROP INDEX IF EXISTS crm.ix_staff_users_status")

    # Drop FKs
    op.drop_constraint(
        "fk_staff_users_archived_by_staff_user_id",
        "staff_users",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_staff_users_disabled_by_staff_user_id",
        "staff_users",
        schema=SCHEMA,
        type_="foreignkey",
    )

    # Drop columns
    op.drop_column("staff_users", "archived_by_staff_user_id", schema=SCHEMA)
    op.drop_column("staff_users", "archived_reason", schema=SCHEMA)
    op.drop_column("staff_users", "archived_at", schema=SCHEMA)

    op.drop_column("staff_users", "disabled_by_staff_user_id", schema=SCHEMA)
    op.drop_column("staff_users", "disabled_source", schema=SCHEMA)
    op.drop_column("staff_users", "disabled_reason", schema=SCHEMA)
    op.drop_column("staff_users", "disabled_at", schema=SCHEMA)

    # NOTE:
    # We intentionally do NOT remove enum value 'archived' from crm.staff_status.
    # PostgreSQL does not support dropping enum values cleanly without recreating the type.
