"""step12 billing profiles and address split

Revision ID: 35d6253f7bb9
Revises: 0fa6ebea9b2d
Create Date: 2026-02-10 14:29:51.507838

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '35d6253f7bb9'
down_revision: Union[str, Sequence[str], None] = '0fa6ebea9b2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SCHEMA = "crm"


def upgrade() -> None:
    # ---------------------------
    # ENUM TYPES (schema-local)
    # ---------------------------
    billing_profile_type = postgresql.ENUM(
        "person",
        "company",
        name="billing_profile_type",
        schema=SCHEMA,
        create_type=False,
    )
    billing_profile_status = postgresql.ENUM(
        "active",
        "archived",
        name="billing_profile_status",
        schema=SCHEMA,
        create_type=False,
    )
    subscriber_address_type = postgresql.ENUM(
        "primary",
        "mailing",
        "registered",
        name="subscriber_address_type",
        schema=SCHEMA,
        create_type=False,
    )

    billing_profile_type.create(op.get_bind(), checkfirst=True)
    billing_profile_status.create(op.get_bind(), checkfirst=True)
    subscriber_address_type.create(op.get_bind(), checkfirst=True)

    # ---------------------------
    # billing_profiles
    # ---------------------------
    op.create_table(
        "billing_profiles",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column("type", billing_profile_type, nullable=False),
        sa.Column("status", billing_profile_status, nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_billing_profiles_status",
        "billing_profiles",
        ["status"],
        schema=SCHEMA,
    )

    # ---------------------------
    # billing_profile_versions (snapshot JSONB)
    # ---------------------------
    op.create_table(
        "billing_profile_versions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "billing_profile_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.billing_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_staff_id", sa.BigInteger(), nullable=True),  # opcjonalnie pod staff w przyszłości
        sa.UniqueConstraint("billing_profile_id", "version_no", name="uq_billing_profile_versions_profile_ver"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_billing_profile_versions_profile_id",
        "billing_profile_versions",
        ["billing_profile_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_billing_profile_versions_created_at",
        "billing_profile_versions",
        ["created_at"],
        schema=SCHEMA,
    )

    # ---------------------------
    # View: v_billing_profile_current
    #  - current version per billing_profile
    # ---------------------------
    op.execute(
        f"""
        CREATE OR REPLACE VIEW {SCHEMA}.v_billing_profile_current AS
        SELECT
            bp.id AS billing_profile_id,
            bp.type AS billing_profile_type,
            bp.status AS billing_profile_status,
            bp.created_at AS billing_profile_created_at,
            bp.updated_at AS billing_profile_updated_at,
            v.id AS billing_profile_version_id,
            v.version_no,
            v.snapshot,
            v.created_at AS version_created_at
        FROM {SCHEMA}.billing_profiles bp
        JOIN LATERAL (
            SELECT *
            FROM {SCHEMA}.billing_profile_versions v
            WHERE v.billing_profile_id = bp.id
            ORDER BY v.version_no DESC
            LIMIT 1
        ) v ON TRUE;
        """
    )

    # ---------------------------
    # subscriber_billing_profiles
    #  - history + exactly one current billing profile per subscriber
    # ---------------------------
    op.create_table(
        "subscriber_billing_profiles",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "subscriber_id",
            sa.BigInteger(),  # <- dopasuj do crm.subscribers.id jeśli masz Integer
            sa.ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "billing_profile_id",
            sa.BigInteger(),
            sa.ForeignKey(f"{SCHEMA}.billing_profiles.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_subscriber_billing_profiles_subscriber_id",
        "subscriber_billing_profiles",
        ["subscriber_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_subscriber_billing_profiles_billing_profile_id",
        "subscriber_billing_profiles",
        ["billing_profile_id"],
        schema=SCHEMA,
    )
    # One current per subscriber (partial unique index)
    op.create_index(
        "uq_subscriber_billing_profiles_one_current",
        "subscriber_billing_profiles",
        ["subscriber_id"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("is_current = true"),
    )

    # ---------------------------
    # subscriber_addresses (abonent address)
    # ---------------------------
    op.create_table(
        "subscriber_addresses",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "subscriber_id",
            sa.BigInteger(),  # <- dopasuj do crm.subscribers.id jeśli masz Integer
            sa.ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", subscriber_address_type, nullable=False, server_default="primary"),
        sa.Column("line1", sa.String(length=200), nullable=False),
        sa.Column("line2", sa.String(length=200), nullable=True),
        sa.Column("postal_code", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False, server_default="PL"),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_subscriber_addresses_subscriber_id",
        "subscriber_addresses",
        ["subscriber_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_subscriber_addresses_city",
        "subscriber_addresses",
        ["city"],
        schema=SCHEMA,
    )
    # One current per (subscriber,type) (partial unique index)
    op.create_index(
        "uq_subscriber_addresses_one_current_per_type",
        "subscriber_addresses",
        ["subscriber_id", "type"],
        unique=True,
        schema=SCHEMA,
        postgresql_where=sa.text("is_current = true"),
    )

    # ---------------------------
    # service_addresses (installation address)
    # ---------------------------
    op.create_table(
        "service_addresses",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column(
            "subscriber_id",
            sa.BigInteger(),  # <- dopasuj do crm.subscribers.id jeśli masz Integer
            sa.ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(length=120), nullable=True),
        sa.Column("line1", sa.String(length=200), nullable=False),
        sa.Column("line2", sa.String(length=200), nullable=True),
        sa.Column("postal_code", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False, server_default="PL"),
        sa.Column("gps_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("gps_lng", sa.Numeric(9, 6), nullable=True),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("valid_to", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_service_addresses_subscriber_id",
        "service_addresses",
        ["subscriber_id"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_service_addresses_city",
        "service_addresses",
        ["city"],
        schema=SCHEMA,
    )
    op.create_index(
        "ix_service_addresses_postal_code",
        "service_addresses",
        ["postal_code"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_index("ix_service_addresses_postal_code", table_name="service_addresses", schema=SCHEMA)
    op.drop_index("ix_service_addresses_city", table_name="service_addresses", schema=SCHEMA)
    op.drop_index("ix_service_addresses_subscriber_id", table_name="service_addresses", schema=SCHEMA)
    op.drop_table("service_addresses", schema=SCHEMA)

    op.drop_index("uq_subscriber_addresses_one_current_per_type", table_name="subscriber_addresses", schema=SCHEMA)
    op.drop_index("ix_subscriber_addresses_city", table_name="subscriber_addresses", schema=SCHEMA)
    op.drop_index("ix_subscriber_addresses_subscriber_id", table_name="subscriber_addresses", schema=SCHEMA)
    op.drop_table("subscriber_addresses", schema=SCHEMA)

    op.drop_index("uq_subscriber_billing_profiles_one_current", table_name="subscriber_billing_profiles", schema=SCHEMA)
    op.drop_index("ix_subscriber_billing_profiles_billing_profile_id", table_name="subscriber_billing_profiles", schema=SCHEMA)
    op.drop_index("ix_subscriber_billing_profiles_subscriber_id", table_name="subscriber_billing_profiles", schema=SCHEMA)
    op.drop_table("subscriber_billing_profiles", schema=SCHEMA)

    op.execute(f"DROP VIEW IF EXISTS {SCHEMA}.v_billing_profile_current;")

    op.drop_index("ix_billing_profile_versions_created_at", table_name="billing_profile_versions", schema=SCHEMA)
    op.drop_index("ix_billing_profile_versions_profile_id", table_name="billing_profile_versions", schema=SCHEMA)
    op.drop_table("billing_profile_versions", schema=SCHEMA)

    op.drop_index("ix_billing_profiles_status", table_name="billing_profiles", schema=SCHEMA)
    op.drop_table("billing_profiles", schema=SCHEMA)

    # Drop ENUM types (reverse)
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.subscriber_address_type;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.billing_profile_status;")
    op.execute(f"DROP TYPE IF EXISTS {SCHEMA}.billing_profile_type;")
