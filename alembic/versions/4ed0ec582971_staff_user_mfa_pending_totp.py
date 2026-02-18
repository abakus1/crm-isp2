"""staff_user_mfa pending totp

Revision ID: 4ed0ec582971
Revises: 74c2c19e3046
Create Date: 2026-02-16 17:35:28.404546

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4ed0ec582971'
down_revision: Union[str, Sequence[str], None] = '74c2c19e3046'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staff_user_mfa",
        sa.Column("pending_secret", sa.String(length=128), nullable=True),
        schema="crm",
    )
    op.add_column(
        "staff_user_mfa",
        sa.Column("pending_created_at", sa.DateTime(timezone=True), nullable=True),
        schema="crm",
    )


def downgrade() -> None:
    op.drop_column("staff_user_mfa", "pending_created_at", schema="crm")
    op.drop_column("staff_user_mfa", "pending_secret", schema="crm")
