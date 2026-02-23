"""add_catalog_requirements_rbac_actions

Revision ID: b0b5db14fcba
Revises: 157cb9ef3ffc
Create Date: 2026-02-23 19:18:50.650183

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b0b5db14fcba'
down_revision: Union[str, Sequence[str], None] = '157cb9ef3ffc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    actions = [
        (
            "catalog.products.read",
            "Katalog: odczyt produktów",
            "Pozwala przeglądać katalog produktów (codes/types) w konfiguracji i procesie składania usług.",
        ),
        (
            "catalog.requirements.read",
            "Katalog: odczyt wymagań addonów",
            "Pozwala przeglądać wymagania (zależności) pomiędzy produktem głównym a addonami (ONT/STB/public IP).",
        ),
        (
            "catalog.requirements.write",
            "Katalog: edycja wymagań addonów",
            "Pozwala tworzyć/zmieniać/usuwać wymagania addonów dla produktu głównego (wymuszenia min/max + hard required).",
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

    # Admin zawsze ma wszystko.
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN (
          'catalog.products.read',
          'catalog.requirements.read',
          'catalog.requirements.write'
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
              'catalog.products.read',
              'catalog.requirements.read',
              'catalog.requirements.write'
            )
          );
        """
    )

    op.execute(
        f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN (
          'catalog.products.read',
          'catalog.requirements.read',
          'catalog.requirements.write'
        );
        """
    )
