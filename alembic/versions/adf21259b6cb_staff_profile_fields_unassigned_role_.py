"""staff profile fields + unassigned role + cleanup non-admin staff

Revision ID: adf21259b6cb
Revises: fe507b371ba5
Create Date: 2026-02-20 17:30:41.588033

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'adf21259b6cb'
down_revision: Union[str, Sequence[str], None] = 'fe507b371ba5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # 1) staff_users: pola profilu
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("first_name", sa.String(length=80), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("phone_company", sa.String(length=32), nullable=True))

    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("job_title", sa.String(length=120), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("birth_date", sa.Date(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("pesel", sa.String(length=11), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("id_document_no", sa.String(length=32), nullable=True))

    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_registered", sa.Text(), nullable=True))
    op.add_column(schema=schema, table_name="staff_users", column=sa.Column("address_current", sa.Text(), nullable=True))
    op.add_column(
        schema=schema,
        table_name="staff_users",
        column=sa.Column("address_current_same_as_registered", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )

    # 2) seed rola "unassigned" (pracownik bez dostępu do modułów)
    # Minimalne uprawnienia: login + self setup + whoami + podgląd własnej kartoteki.
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_roles (code, label_pl, description_pl)
        VALUES ('unassigned', 'Brak stanowiska', 'Nowy pracownik bez dostępu (tylko logowanie + konto własne).')
        ON CONFLICT (code) DO NOTHING;
        """
    )

    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN (
          'system.whoami.read',
          'identity.login',
          'identity.setup.password',
          'identity.setup.totp',
          'identity.self.password.change',
          'identity.self.totp.reset.begin',
          'identity.self.totp.reset.confirm',
          'identity.self.email.update',
          'staff.read.self'
        )
        WHERE r.code = 'unassigned'
        ON CONFLICT DO NOTHING;
        """
    )

    # 3) twardy cleanup: usuń wszystkich staff != admin
    # (Uwaga: to jest świadome i nieodwracalne na downgrade.)
    op.execute(
        f"""
        DELETE FROM {schema}.staff_user_mfa
        WHERE staff_user_id IN (SELECT id FROM {schema}.staff_users WHERE role <> 'admin');
        """
    )
    op.execute(
        f"""
        DELETE FROM {schema}.staff_users
        WHERE role <> 'admin';
        """
    )


def downgrade() -> None:
    schema = "crm"

    # Nie odtwarzamy usuniętych pracowników.

    # Usuwamy role+actions (bez ruszania danych innych ról)
    op.execute(
        f"""
        DELETE FROM {schema}.rbac_role_actions
        WHERE role_id = (SELECT id FROM {schema}.rbac_roles WHERE code='unassigned');
        """
    )
    op.execute(f"DELETE FROM {schema}.rbac_roles WHERE code='unassigned';")

    # drop columns
    op.drop_column("staff_users", "address_current_same_as_registered", schema=schema)
    op.drop_column("staff_users", "address_current", schema=schema)
    op.drop_column("staff_users", "address_registered", schema=schema)
    op.drop_column("staff_users", "id_document_no", schema=schema)
    op.drop_column("staff_users", "pesel", schema=schema)
    op.drop_column("staff_users", "birth_date", schema=schema)
    op.drop_column("staff_users", "job_title", schema=schema)
    op.drop_column("staff_users", "phone_company", schema=schema)
    op.drop_column("staff_users", "last_name", schema=schema)
    op.drop_column("staff_users", "first_name", schema=schema)