"""rbac permissions in db

Revision ID: e750da90bed5
Revises: 4ed0ec582971
Create Date: 2026-02-17 17:14:08.748091

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e750da90bed5'
down_revision: Union[str, Sequence[str], None] = '4ed0ec582971'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    # 0) staff_users.role: enum -> text (źródło prawdy przenosimy do RBAC w DB)
    op.execute(f"ALTER TABLE {schema}.staff_users ALTER COLUMN role TYPE varchar(64) USING role::text")

    # 1) RBAC tables
    op.create_table(
        "rbac_roles",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label_pl", sa.String(length=128), nullable=False),
        sa.Column("description_pl", sa.String(length=500), nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_rbac_roles_code"),
        schema=schema,
    )

    op.create_table(
        "rbac_actions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("label_pl", sa.String(length=160), nullable=False),
        sa.Column("description_pl", sa.String(length=700), nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("code", name="uq_rbac_actions_code"),
        schema=schema,
    )

    op.create_table(
        "rbac_role_actions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("role_id", sa.BigInteger(), sa.ForeignKey(f"{schema}.rbac_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_id", sa.BigInteger(), sa.ForeignKey(f"{schema}.rbac_actions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("role_id", "action_id", name="uq_rbac_role_actions_role_action"),
        schema=schema,
    )

    op.create_table(
        "staff_action_overrides",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("staff_user_id", sa.BigInteger(), sa.ForeignKey(f"{schema}.staff_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_id", sa.BigInteger(), sa.ForeignKey(f"{schema}.rbac_actions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("effect", sa.String(length=8), nullable=False),  # allow|deny
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("staff_user_id", "action_id", name="uq_staff_action_overrides_staff_action"),
        schema=schema,
    )

    # 2) seed roles
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_roles (code, label_pl, description_pl)
        VALUES
          ('admin', 'Administrator', 'Pełny dostęp administracyjny do systemu.'),
          ('staff', 'Pracownik', 'Domyślny profil pracownika (bez uprawnień administracyjnych).')
        ON CONFLICT (code) DO NOTHING;
        """
    )

    # 3) seed actions (PL label + description)
    actions = [
        ("system.health.read", "Podgląd stanu systemu", "Pozwala odczytać /health oraz podstawowe informacje diagnostyczne."),
        ("system.whoami.read", "Podgląd: kim jestem", "Pozwala odczytać bieżącego użytkownika (whoami) i kontekst sesji."),

        ("identity.login", "Logowanie", "Pozwala wykonać operację logowania."),
        ("identity.bootstrap", "Bootstrap systemu", "Pozwala przejść przez startowy bootstrap (pierwsze uruchomienie)."),
        ("identity.setup.password", "Ustawienie hasła (pierwsze logowanie)", "Pozwala ustawić nowe hasło w trybie setup."),
        ("identity.setup.totp", "Ustawienie TOTP (pierwsze logowanie)", "Pozwala skonfigurować TOTP w trybie setup."),
        ("identity.self.password.change", "Zmiana własnego hasła", "Pozwala zmienić hasło na własnym koncie."),
        ("identity.self.totp.reset.begin", "Reset własnego TOTP – start", "Pozwala rozpocząć reset własnego TOTP."),
        ("identity.self.totp.reset.confirm", "Reset własnego TOTP – potwierdzenie", "Pozwala potwierdzić reset własnego TOTP."),
        ("identity.self.email.update", "Zmiana własnego e-mail", "Pozwala zmienić e-mail na własnym koncie (z wymaganym step-up)."),

        ("audit.read_all", "Podgląd audytu (globalny)", "Pozwala przeglądać pełny log audytowy (ADMIN)."),
        ("activity.read_all", "Podgląd aktywności", "Pozwala przeglądać log aktywności (operacyjny)."),

        ("staff.list", "Lista pracowników", "Pozwala wyświetlić listę pracowników."),
        ("staff.read.self", "Podgląd własnej kartoteki", "Pozwala wyświetlić własne dane pracownika."),
        ("staff.read", "Podgląd pracownika", "Pozwala odczytać dane pracownika."),
        ("staff.create", "Dodanie pracownika", "Pozwala utworzyć konto pracownika."),
        ("staff.disable", "Blokowanie pracownika", "Pozwala zablokować konto pracownika (disable)."),
        ("staff.enable", "Odblokowanie pracownika", "Pozwala odblokować konto pracownika (enable)."),
        ("staff.archive", "Archiwizacja pracownika", "Pozwala przenieść pracownika do archiwum."),
        ("staff.unarchive", "Przywrócenie pracownika", "Pozwala przywrócić pracownika z archiwum."),
        ("staff.reset_password", "Reset hasła pracownika", "Pozwala wygenerować nowe hasło i wymusić zmianę przy logowaniu."),
        ("staff.reset_totp", "Reset TOTP pracownika", "Pozwala zresetować TOTP pracownika."),
        ("staff.permissions.read", "Podgląd uprawnień pracownika", "Pozwala zobaczyć listę uprawnień + override dla pracownika."),
        ("staff.permissions.write", "Edycja uprawnień pracownika", "Pozwala ustawić override allow/deny dla pracownika."),

        ("subscribers.read", "Abonenci: podgląd", "Pozwala przeglądać dane abonentów."),
        ("subscribers.write", "Abonenci: edycja", "Pozwala edytować dane abonentów."),
        ("contracts.read", "Umowy: podgląd", "Pozwala przeglądać umowy i subskrypcje."),
        ("contracts.write", "Umowy: edycja", "Pozwala tworzyć/edytować umowy i subskrypcje."),
        ("billing.read", "Billing: podgląd", "Pozwala przeglądać naliczenia i dokumenty."),
        ("billing.write", "Billing: edycja", "Pozwala wykonywać operacje billingowe (w CRM)."),
        ("billing.export_optima", "Eksport do Optimy", "Pozwala uruchomić eksport dokumentów do Optimy."),

        ("rbac.actions.list", "RBAC: lista uprawnień", "Pozwala pobrać katalog wszystkich uprawnień."),
        ("rbac.roles.list", "RBAC: lista ról", "Pozwala pobrać listę ról/stanowisk."),
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

    # 4) seed role->actions (minimalne, bez „magii” i bez zależności)
    # Admin: prawie wszystko. Staff: podstawy operacyjne.
    op.execute(
        f"""
        WITH role_ids AS (
          SELECT id, code FROM {schema}.rbac_roles WHERE code IN ('admin','staff')
        ), action_ids AS (
          SELECT id, code FROM {schema}.rbac_actions
        )
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM role_ids r
        JOIN action_ids a ON (
          (r.code = 'admin' AND a.code NOT IN ('identity.bootstrap'))
          OR
          (r.code = 'staff' AND a.code IN (
            'system.health.read',
            'system.whoami.read',
            'identity.login',
            'identity.setup.password',
            'identity.setup.totp',
            'identity.self.password.change',
            'identity.self.totp.reset.begin',
            'identity.self.totp.reset.confirm',
            'identity.self.email.update',
            'activity.read_all',
            'staff.list',
            'staff.read.self',
            'subscribers.read',
            'subscribers.write',
            'contracts.read',
            'contracts.write',
            'billing.read'
          ))
        )
        ON CONFLICT DO NOTHING;
        """
    )

    # Admin: dodatkowo bootstrap
    op.execute(
        f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code = 'identity.bootstrap'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    schema = "crm"
    op.drop_table("staff_action_overrides", schema=schema)
    op.drop_table("rbac_role_actions", schema=schema)
    op.drop_table("rbac_actions", schema=schema)
    op.drop_table("rbac_roles", schema=schema)
    # downgrade roli: nie cofamy typu, bo to ryzykowne (i niepotrzebne)