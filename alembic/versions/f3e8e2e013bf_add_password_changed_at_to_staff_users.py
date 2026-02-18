"""add_password_changed_at_to_staff_users

Revision ID: f3e8e2e013bf
Revises: def8121c2b48
Create Date: 2026-02-13 11:40:11.050897

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3e8e2e013bf'
down_revision: Union[str, Sequence[str], None] = 'def8121c2b48'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dodaj kolumnę do rotacji hasła (wymuszenie zmiany co X dni)
    op.add_column(
        "staff_users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
        schema="crm",
    )

    # Backfill: dla istniejących użytkowników ustaw teraz,
    # żeby po wdrożeniu nie zostali natychmiast zablokowani.
    op.execute("""
        UPDATE crm.staff_users
        SET password_changed_at = COALESCE(password_changed_at, now())
    """)


def downgrade() -> None:
    op.drop_column("staff_users", "password_changed_at", schema="crm")
