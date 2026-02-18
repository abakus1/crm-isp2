"""add rbac role CRUD actions

Revision ID: 3f9a1d56d877
Revises: f552e6142eac
Create Date: 2026-02-17 18:52:30.766432

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f9a1d56d877'
down_revision: Union[str, Sequence[str], None] = 'f552e6142eac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "rbac.roles.create",
            "RBAC: tworzenie roli",
            "Pozwala tworzyć nowe role/stanowiska (rbac_roles).",
        ),
        (
            "rbac.roles.update",
            "RBAC: edycja roli",
            "Pozwala edytować metadane roli/stanowiska (label/opis).",
        ),
        (
            "rbac.roles.delete",
            "RBAC: usuwanie roli",
            "Pozwala usuwać role/stanowiska (tylko gdy nieużywane).",
        ),
    ]

    # 1) Dodaj atomy akcji (kontrakt systemu)
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

    # 2) Grant dla roli admin (domyślnie admin ma wszystko co krytyczne)
    op.execute(
        sa.text(
            f"""
            INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
            SELECT r.id, a.id
            FROM {schema}.rbac_roles r
            JOIN {schema}.rbac_actions a
              ON a.code IN ('rbac.roles.create','rbac.roles.update','rbac.roles.delete')
            WHERE r.code = 'admin'
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    schema = "crm"

    # 1) Usuń granty z admina
    op.execute(
        sa.text(
            f"""
            DELETE FROM {schema}.rbac_role_actions ra
            USING {schema}.rbac_roles r, {schema}.rbac_actions a
            WHERE ra.role_id = r.id
              AND ra.action_id = a.id
              AND r.code = 'admin'
              AND a.code IN ('rbac.roles.create','rbac.roles.update','rbac.roles.delete')
            """
        )
    )

    # 2) Usuń atomy akcji (jeśli nigdzie indziej ich nie używasz — tu na pewno nie powinny)
    op.execute(
        sa.text(
            f"""
            DELETE FROM {schema}.rbac_actions
            WHERE code IN ('rbac.roles.create','rbac.roles.update','rbac.roles.delete')
            """
        )
    )