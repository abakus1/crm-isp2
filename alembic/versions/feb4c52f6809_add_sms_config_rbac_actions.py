"""add_sms_config_rbac_actions

Revision ID: feb4c52f6809
Revises: e1e0bf79a82e
Create Date: 2026-03-06 09:00:15.967922

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'feb4c52f6809'
down_revision: Union[str, Sequence[str], None] = 'e1e0bf79a82e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
