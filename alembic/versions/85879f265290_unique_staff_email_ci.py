"""unique staff email ci

Revision ID: 85879f265290
Revises: 3bb3d7325309
Create Date: 2026-02-15 18:17:49.385898

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '85879f265290'
down_revision: Union[str, Sequence[str], None] = '3bb3d7325309'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None




def upgrade() -> None:
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_users_email_ci
        ON crm.staff_users (lower(email))
        WHERE email IS NOT NULL;
        """
    )

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS crm.ux_staff_users_email_ci;")