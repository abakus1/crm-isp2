"""add prg rbac actions

Revision ID: 070e78afb010
Revises: 3f9a1d56d877
Create Date: 2026-02-18 19:35:36.565886

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '070e78afb010'
down_revision: Union[str, Sequence[str], None] = '3f9a1d56d877'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        ("prg.local_point.create", "PRG: dodanie lokalnego punktu adresowego", "Pozwala dodać lokalny punkt adresowy (LOCAL_PENDING), gdy PRG nie ma jeszcze numeru."),
        ("prg.local_point.edit", "PRG: edycja lokalnego punktu adresowego", "Pozwala edytować lokalny punkt adresowy (np. numer, lokal, geometria)."),
        ("prg.local_point.delete", "PRG: usunięcie lokalnego punktu adresowego", "Pozwala usunąć lokalny punkt adresowy (tylko jeśli brak powiązań)."),
        ("prg.local_point.approve", "PRG: zatwierdzenie lokalnego punktu", "Pozwala zatwierdzać/rozwiązywać punkty w workflow (opcjonalnie)."),
        ("prg.reconcile.run", "PRG: uruchom reconciliację", "Pozwala uruchomić dopasowanie lokalnych punktów do PRG po imporcie/delcie."),
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

    # Admin zawsze ma wszystko: dopisz nowe uprawnienia do roli admin.
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN (
          'prg.local_point.create',
          'prg.local_point.edit',
          'prg.local_point.delete',
          'prg.local_point.approve',
          'prg.reconcile.run'
        )
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    schema = "crm"
    # odpinamy od admin
    op.execute(
        f"""
        DELETE FROM {schema}.rbac_role_actions
        WHERE role_id = (SELECT id FROM {schema}.rbac_roles WHERE code='admin')
          AND action_id IN (
            SELECT id FROM {schema}.rbac_actions WHERE code IN (
              'prg.local_point.create',
              'prg.local_point.edit',
              'prg.local_point.delete',
              'prg.local_point.approve',
              'prg.reconcile.run'
            )
          );
        """
    )

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN (
          'prg.local_point.create',
          'prg.local_point.edit',
          'prg.local_point.delete',
          'prg.local_point.approve',
          'prg.reconcile.run'
        );
        """
    )
