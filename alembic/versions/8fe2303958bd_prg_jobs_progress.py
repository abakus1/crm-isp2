"""prg jobs progress

Revision ID: 8fe2303958bd
Revises: 76540c6329c7
Create Date: 2026-02-18 23:55:47.555378

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '8fe2303958bd'
down_revision: Union[str, Sequence[str], None] = '76540c6329c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    schema = "crm"

    op.create_table(
        "prg_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_type", sa.String(length=16), nullable=False),  # fetch|import|reconcile
        sa.Column("status", sa.String(length=16), nullable=False, server_default=sa.text("'running'")),  # running|success|failed|skipped
        sa.Column("stage", sa.String(length=64), nullable=True),  # np. downloading|hashing|saving|reading|upserting|finalizing
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        schema=schema,
    )

    op.create_index(
        "ix_prg_jobs_type_status_started",
        "prg_jobs",
        ["job_type", "status", "started_at"],
        unique=False,
        schema=schema,
    )

    op.create_table(
        "prg_job_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False, server_default=sa.text("'info'")),
        sa.Column("line", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["job_id"], [f"{schema}.prg_jobs.id"], ondelete="CASCADE"),
        schema=schema,
    )

    op.create_index(
        "ix_prg_job_logs_job_created",
        "prg_job_logs",
        ["job_id", "created_at"],
        unique=False,
        schema=schema,
    )


def downgrade() -> None:
    schema = "crm"
    op.drop_index("ix_prg_job_logs_job_created", table_name="prg_job_logs", schema=schema)
    op.drop_table("prg_job_logs", schema=schema)
    op.drop_index("ix_prg_jobs_type_status_started", table_name="prg_jobs", schema=schema)
    op.drop_table("prg_jobs", schema=schema)