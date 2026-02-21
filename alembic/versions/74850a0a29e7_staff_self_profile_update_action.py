"""staff: self profile update action

Revision ID: 74850a0a29e7
Revises: 1a32134fc690
Create Date: 2026-02-21 17:47:35.886561

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '74850a0a29e7'
down_revision: Union[str, Sequence[str], None] = '1a32134fc690'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "staff.update.self",
            "Profil: edycja własnych danych",
            "Pozwala zalogowanemu użytkownikowi edytować własne dane profilu (osobna ścieżka od /staff/{id}).",
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

    # grant dla admin + staff
    op.execute(
        sa.text(
            f"""
            INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
            SELECT r.id, a.id
            FROM {schema}.rbac_roles r
            JOIN {schema}.rbac_actions a
              ON a.code IN ('staff.update.self')
            WHERE r.code IN ('admin','staff')
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
              AND r.code IN ('admin','staff')
              AND a.code IN ('staff.update.self')
            """
        )
    )

    op.execute(
        sa.text(
            f"""
            DELETE FROM {schema}.rbac_actions
            WHERE code IN ('staff.update.self')
            """
        )
    )
