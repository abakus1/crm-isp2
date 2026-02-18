"""subscriber profile versions

Revision ID: 0fa6ebea9b2d
Revises: 0001_init_subscribers_consents
Create Date: 2026-02-10 13:33:45.407584

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fa6ebea9b2d'
down_revision: Union[str, Sequence[str], None] = '0001_init_subscribers_consents'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriber_profile_versions",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("subscriber_id", sa.BigInteger(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("data", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False, server_default=sa.text("'system'")),
        sa.Column("actor_staff_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_user_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["subscriber_id"],
            ["crm.subscribers.id"],
            name="fk_profile_versions_subscriber",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("subscriber_id", "version_no", name="uq_profile_versions_subscriber_version"),
        schema="crm",
    )

    op.create_index(
        "ix_profile_versions_subscriber_created",
        "subscriber_profile_versions",
        ["subscriber_id", "created_at"],
        schema="crm",
    )

    op.execute(
        """
        CREATE OR REPLACE VIEW crm.v_subscriber_profile_current AS
        SELECT DISTINCT ON (spv.subscriber_id)
            spv.subscriber_id,
            spv.id AS profile_version_id,
            spv.version_no,
            spv.data,
            spv.source,
            spv.actor_staff_id,
            spv.actor_user_id,
            spv.created_at
        FROM crm.subscriber_profile_versions spv
        ORDER BY spv.subscriber_id, spv.version_no DESC, spv.id DESC;
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS crm.v_subscriber_profile_current;")
    op.drop_index("ix_profile_versions_subscriber_created", table_name="subscriber_profile_versions", schema="crm")
    op.drop_table("subscriber_profile_versions", schema="crm")
