"""add staff edit + role assignment actions

Revision ID: a89aa0870d91
Revises: adf21259b6cb
Create Date: 2026-02-20 19:12:15.656304

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a89aa0870d91'
down_revision: Union[str, Sequence[str], None] = 'adf21259b6cb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "staff.update",
            "Pracownicy: edycja danych",
            "Pozwala edytować dane profilu pracownika (bez self-edit).",
        ),
        (
            "staff.role.set",
            "Pracownicy: nadanie roli",
            "Pozwala zmienić rolę/stanowisko pracownika (wymusza relogin).",
        ),
    ]

    for code, label_pl, desc_pl in actions:
        op.execute(
            sa.text(
                f"""
                INSERT INTO {schema}.rbac_actions (code, label_pl, description_pl)
                VALUES (:code, :label_pl, :desc_pl)
                ON CONFLICT (code) DO NOTHING
                """
            ).bindparams(code=code, label_pl=label_pl, desc_pl=desc_pl)
        )

    # grant dla admin
    op.execute(
        sa.text(
            f"""
            INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
            SELECT r.id, a.id
            FROM {schema}.rbac_roles r
            JOIN {schema}.rbac_actions a
              ON a.code IN ('staff.update','staff.role.set')
            WHERE r.code = 'admin'
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    schema = "crm"

    op.execute(
        sa.text(
            f"""
            DELETE FROM {schema}.rbac_role_actions ra
            USING {schema}.rbac_roles r, {schema}.rbac_actions a
            WHERE ra.role_id = r.id
              AND ra.action_id = a.id
              AND r.code = 'admin'
              AND a.code IN ('staff.update','staff.role.set')
            """
        )
    )

    op.execute(
        sa.text(
            f"""
            DELETE FROM {schema}.rbac_actions
            WHERE code IN ('staff.update','staff.role.set')
            """
        )
    )