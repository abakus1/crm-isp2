"""auth_hardening_throttle_and_last_seen

Revision ID: def8121c2b48
Revises: 5c626c55ae75
Create Date: 2026-02-12 09:55:08.518936

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'def8121c2b48'
down_revision: Union[str, Sequence[str], None] = '5c626c55ae75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    schema = "crm"

    # 1) auth_throttle – backend pod lockout/backoff per user/IP
    op.create_table(
        "auth_throttle",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("key_type", sa.String(length=32), nullable=False),   # ip | user | ip_user
        sa.Column("key", sa.String(length=255), nullable=False),       # np. "1.2.3.4" albo "abakus" albo "1.2.3.4|abakus"
        sa.Column("fail_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("first_fail_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_fail_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("key_type", "key", name="uq_auth_throttle_key_type_key"),
        schema=schema,
    )

    # lookup: key_type + key (mimo UNIQUE, osobny indeks bywa realnie pomocny)
    op.create_index(
        "ix_auth_throttle_key_type_key",
        "auth_throttle",
        ["key_type", "key"],
        unique=False,
        schema=schema,
    )

    # szybkie sprawdzanie aktywnych blokad
    op.create_index(
        "ix_auth_throttle_locked_until",
        "auth_throttle",
        ["locked_until"],
        unique=False,
        schema=schema,
    )

    # 2) staff_users.last_seen_at – pod idle timeout i telemetrię
    op.add_column(
        "staff_users",
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )


def downgrade() -> None:
    """Downgrade schema."""
    schema = "crm"

    # najpierw kolumna
    op.drop_column("staff_users", "last_seen_at", schema=schema)

    # potem indeksy i tabela
    op.drop_index("ix_auth_throttle_locked_until", table_name="auth_throttle", schema=schema)
    op.drop_index("ix_auth_throttle_key_type_key", table_name="auth_throttle", schema=schema)
    op.drop_table("auth_throttle", schema=schema)
