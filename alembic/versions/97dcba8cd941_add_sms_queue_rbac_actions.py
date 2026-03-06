"""add_sms_queue_rbac_actions

Revision ID: 97dcba8cd941
Revises: d9d1e7113182
Create Date: 2026-03-06 11:08:30.398338

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '97dcba8cd941'
down_revision: Union[str, Sequence[str], None] = 'd9d1e7113182'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "sms.queue.read",
            "SMS: odczyt kolejki",
            "Pozwala przeglądać kolejkę wiadomości SMS, statusy oraz liczniki przetwarzania.",
        ),
        (
            "sms.queue.write",
            "SMS: zarządzanie kolejką",
            "Pozwala dodawać wiadomości do kolejki SMS oraz ręcznie uruchamiać dispatch kolejnej pozycji.",
        ),
    ]

    for code, label_pl, desc_pl in actions:
        op.execute(
            sa.text(
                f"""
                INSERT INTO {schema}.rbac_actions (code, label_pl, description_pl)
                VALUES (:code, :label, :desc)
                ON CONFLICT (code) DO NOTHING
                """
            ).bindparams(code=code, label=label_pl, desc=desc_pl)
        )

    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN (
          'sms.queue.read',
          'sms.queue.write'
        )
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    schema = "crm"

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_role_actions
        WHERE role_id = (SELECT id FROM {schema}.rbac_roles WHERE code='admin')
          AND action_id IN (
            SELECT id FROM {schema}.rbac_actions WHERE code IN (
              'sms.queue.read',
              'sms.queue.write'
            )
          );
        """
    )

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN (
          'sms.queue.read',
          'sms.queue.write'
        );
        """
    )