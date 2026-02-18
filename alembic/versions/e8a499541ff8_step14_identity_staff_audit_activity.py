"""step14 identity staff audit activity

Revision ID: e8a499541ff8
Revises: 78b3d9323c90
Create Date: 2026-02-10 15:29:00.525289

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8a499541ff8'
down_revision: Union[str, Sequence[str], None] = '78b3d9323c90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # ---------------------------
    # ENUMs
    # ---------------------------
    staff_role = postgresql.ENUM(
        "admin",
        "staff",
        name="staff_role",
        schema=SCHEMA,
        create_type=False,
    )
    staff_status = postgresql.ENUM(
        "active",
        "disabled",
        name="staff_status",
        schema=SCHEMA,
        create_type=False,
    )
    mfa_method = postgresql.ENUM(
        "totp",
        name="mfa_method",
        schema=SCHEMA,
        create_type=False,
    )
    audit_severity = postgresql.ENUM(
        "info",
        "warning",
        "security",
        "critical",
        name="audit_severity",
        schema=SCHEMA,
        create_type=False,
    )

    staff_role.create(op.get_bind(), checkfirst=True)
    staff_status.create(op.get_bind(), checkfirst=True)
    mfa_method.create(op.get_bind(), checkfirst=True)
    audit_severity.create(op.get_bind(), checkfirst=True)

    # ---------------------------
    # system_bootstrap_state
    #  - 1 wiersz: czy system jest w trybie bootstrap
    # ---------------------------
    op.create_table(
        "system_bootstrap_state",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column("bootstrap_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_staff_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )

    # Seed: pojedynczy rekord stanu (id=1)
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.system_bootstrap_state (id, bootstrap_required)
        VALUES (1, TRUE)
        ON CONFLICT (id) DO NOTHING;
        """
    )

    # ---------------------------
    # staff_users
    #  - startowe konto admin (bootstrap)
    # ---------------------------
    op.create_table(
        "staff_users",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),

        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),

        sa.Column("role", staff_role, nullable=False, server_default="admin"),
        sa.Column("status", staff_status, nullable=False, server_default="active"),

        # UWAGA: hash przechowuje aplikacja. W bootstrapie ustawiamy marker,
        # a logika auth rozpoznaje "admin/admin" tylko gdy bootstrap_required=TRUE.
        sa.Column("password_hash", sa.Text(), nullable=False),

        sa.Column("must_change_credentials", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("mfa_required", sa.Boolean(), nullable=False, server_default=sa.text("true")),

        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        sa.UniqueConstraint("username", name="uq_staff_users_username"),
        schema=SCHEMA,
    )
    op.create_index("ix_staff_users_role", "staff_users", ["role"], schema=SCHEMA)
    op.create_index("ix_staff_users_status", "staff_users", ["status"], schema=SCHEMA)

    # Seed: startowy admin (id=1 preferowane, ale nie wymuszamy)
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.staff_users (username, email, role, status, password_hash, must_change_credentials, mfa_required)
        VALUES ('admin', NULL, 'admin', 'active', '__BOOTSTRAP_ADMIN__', TRUE, TRUE)
        ON CONFLICT (username) DO NOTHING;
        """
    )

    # ---------------------------
    # staff_user_mfa
    #  - TOTP sekrety (docelowo: szyfrowane / KMS)
    # ---------------------------
    op.create_table(
        "staff_user_mfa",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "staff_user_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("method", mfa_method, nullable=False, server_default="totp"),
        sa.Column("secret", sa.Text(), nullable=False),  # docelowo szyfrowane
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("staff_user_id", "method", name="uq_staff_user_mfa_user_method"),
        schema=SCHEMA,
    )
    op.create_index("ix_staff_user_mfa_staff_user_id", "staff_user_mfa", ["staff_user_id"], schema=SCHEMA)

    # ---------------------------
    # audit_log (ADMIN-only)
    #  - pełny, append-only
    # ---------------------------
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        sa.Column(
            "staff_user_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("severity", audit_severity, nullable=False, server_default="info"),

        sa.Column("action", sa.String(length=120), nullable=False),  # np. contracts.activate, identity.login
        sa.Column("entity_type", sa.String(length=80), nullable=True),  # np. subscriber/contract/subscription/staff_user
        sa.Column("entity_id", sa.String(length=80), nullable=True),

        sa.Column("request_id", sa.String(length=80), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),

        sa.Column("before", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        schema=SCHEMA,
    )
    op.create_index("ix_audit_log_occurred_at", "audit_log", ["occurred_at"], schema=SCHEMA)
    op.create_index("ix_audit_log_staff_user_id", "audit_log", ["staff_user_id"], schema=SCHEMA)
    op.create_index("ix_audit_log_action", "audit_log", ["action"], schema=SCHEMA)
    op.create_index("ix_audit_log_entity", "audit_log", ["entity_type", "entity_id"], schema=SCHEMA)

    # ---------------------------
    # activity_log (STAFF panel timeline)
    #  - odchudzone, bez before/after, bez wrażliwych danych
    # ---------------------------
    op.create_table(
        "activity_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),

        sa.Column(
            "staff_user_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
            nullable=True,
        ),

        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=True),
        sa.Column("entity_id", sa.String(length=80), nullable=True),

        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        schema=SCHEMA,
    )
    op.create_index("ix_activity_log_occurred_at", "activity_log", ["occurred_at"], schema=SCHEMA)
    op.create_index("ix_activity_log_staff_user_id", "activity_log", ["staff_user_id"], schema=SCHEMA)
    op.create_index("ix_activity_log_action", "activity_log", ["action"], schema=SCHEMA)
    op.create_index("ix_activity_log_entity", "activity_log", ["entity_type", "entity_id"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("ix_activity_log_entity", table_name="activity_log", schema=SCHEMA)
    op.drop_index("ix_activity_log_action", table_name="activity_log", schema=SCHEMA)
    op.drop_index("ix_activity_log_staff_user_id", table_name="activity_log", schema=SCHEMA)
    op.drop_index("ix_activity_log_occurred_at", table_name="activity_log", schema=SCHEMA)
    op.drop_table("activity_log", schema=SCHEMA)

    op.drop_index("ix_audit_log_entity", table_name="audit_log", schema=SCHEMA)
    op.drop_index("ix_audit_log_action", table_name="audit_log", schema=SCHEMA)
    op.drop_index("ix_audit_log_staff_user_id", table_name="audit_log", schema=SCHEMA)
    op.drop_index("ix_audit_log_occurred_at", table_name="audit_log", schema=SCHEMA)
    op.drop_table("audit_log", schema=SCHEMA)

    op.drop_index("ix_staff_user_mfa_staff_user_id", table_name="staff_user_mfa", schema=SCHEMA)
    op.drop_table("staff_user_mfa", schema=SCHEMA)

    op.drop_index("ix_staff_users_status", table_name="staff_users", schema=SCHEMA)
    op.drop_index("ix_staff_users_role", table_name="staff_users", schema=SCHEMA)
    op.drop_table("staff_users", schema=SCHEMA)

    op.drop_table("system_bootstrap_state", schema=SCHEMA)

    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.audit_severity;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.mfa_method;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.staff_status;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.staff_role;")