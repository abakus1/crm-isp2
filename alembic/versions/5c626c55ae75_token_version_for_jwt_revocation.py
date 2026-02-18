"""token_version for JWT revocation

Revision ID: 5c626c55ae75
Revises: e8a499541ff8
Create Date: 2026-02-11 19:38:39.720661

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5c626c55ae75'
down_revision: Union[str, Sequence[str], None] = 'e8a499541ff8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "crm"

def upgrade() -> None:
    op.add_column(
        "staff_users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        schema=SCHEMA,
    )
    op.execute(f"UPDATE {SCHEMA}.staff_users SET token_version = 1 WHERE token_version IS NULL;")
    op.create_index("ix_staff_users_token_version", "staff_users", ["token_version"], schema=SCHEMA)

def downgrade() -> None:
    op.drop_index("ix_staff_users_token_version", table_name="staff_users", schema=SCHEMA)
    op.drop_column("staff_users", "token_version", schema=SCHEMA)