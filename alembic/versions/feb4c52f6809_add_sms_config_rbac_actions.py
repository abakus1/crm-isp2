"""add_sms_config_rbac_actions

Revision ID: feb4c52f6809
Revises: e1e0bf79a82e
Create Date: 2026-03-06 09:00:15.967922

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'feb4c52f6809'
down_revision: Union[str, Sequence[str], None] = 'e1e0bf79a82e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "sms.config.read",
            "SMS: odczyt konfiguracji",
            "Pozwala przeglądać konfigurację integracji SMS (SMeSKom) oraz status połączenia w panelu administracyjnym.",
        ),
        (
            "sms.config.write",
            "SMS: test i edycja konfiguracji",
            "Pozwala testować połączenie i zarządzać konfiguracją integracji SMS (SMeSKom).",
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
          'sms.config.read',
          'sms.config.write'
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
              'sms.config.read',
              'sms.config.write'
            )
          );
        """
    )

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN (
          'sms.config.read',
          'sms.config.write'
        );
        """
    )