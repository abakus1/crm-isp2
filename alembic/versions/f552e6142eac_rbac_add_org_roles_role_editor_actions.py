"""rbac: add org roles + role editor actions

Revision ID: f552e6142eac
Revises: e750da90bed5
Create Date: 2026-02-17 18:00:17.059969

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql



# revision identifiers, used by Alembic.
revision: str = 'f552e6142eac'
down_revision: Union[str, Sequence[str], None] = 'e750da90bed5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # 1) dodatkowe role (8 + admin + staff = 10)
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_roles (code, label_pl, description_pl)
        VALUES
          ('sales', 'Sprzedaż', 'Uprawnienia handlowe (oferty, zamówienia, kontakt).'),
          ('support', 'BOK / Support', 'Obsługa zgłoszeń i kontakt z abonentem.'),
          ('technician', 'Technik terenowy', 'Realizacja zleceń i wizyt instalacyjnych.'),
          ('dispatcher', 'Dyspozytor', 'Planowanie i przydzielanie zleceń/terminów.'),
          ('network', 'Sieciowiec / NOC', 'Operacje sieciowe (zasoby, provisioning – OSS-lite).'),
          ('warehouse', 'Magazyn', 'Sprzęt, wydania/zwroty, ewidencja urządzeń.'),
          ('billing', 'Billing', 'Naliczenia, dokumenty wewnętrzne, rozliczenia operacyjne.'),
          ('accounting', 'Księgowość', 'Kontrola księgowa (Optima SoR) i zgodność dokumentów.')
        ON CONFLICT (code) DO NOTHING;
        """
    )

    # 2) nowe akcje do edytora ról
    actions = [
        (
            "rbac.role_actions.read",
            "RBAC: podgląd uprawnień roli",
            "Pozwala pobrać listę uprawnień (checkboxy) przypisanych do roli.",
        ),
        (
            "rbac.role_actions.write",
            "RBAC: edycja uprawnień roli",
            "Pozwala zapisać mapę uprawnień roli (aktualizacja rbac_role_actions).",
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

    # 3) admin dostaje te nowe uprawnienia
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN ('rbac.role_actions.read','rbac.role_actions.write')
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    schema = "crm"

    # remove role->actions grants (admin) for new actions
    op.execute(
        f"""
        DELETE FROM {schema}.rbac_role_actions ra
        USING {schema}.rbac_roles r, {schema}.rbac_actions a
        WHERE ra.role_id = r.id
          AND ra.action_id = a.id
          AND r.code = 'admin'
          AND a.code IN ('rbac.role_actions.read','rbac.role_actions.write');
        """
    )

    # remove actions
    op.execute(
        f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN ('rbac.role_actions.read','rbac.role_actions.write');
        """
    )

    # remove added roles
    op.execute(
        f"""
        DELETE FROM {schema}.rbac_roles
        WHERE code IN ('sales','support','technician','dispatcher','network','warehouse','billing','accounting');
        """
    )
