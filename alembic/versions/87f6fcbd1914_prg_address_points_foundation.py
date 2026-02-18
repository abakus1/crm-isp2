"""prg address points foundation

Revision ID: 87f6fcbd1914
Revises: 070e78afb010
Create Date: 2026-02-18 20:55:00.574930

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '87f6fcbd1914'
down_revision: Union[str, Sequence[str], None] = '070e78afb010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

class PGPoint(sa.types.UserDefinedType):
    def get_col_spec(self, **kw):
        return "POINT"


def upgrade() -> None:
    schema = "crm"

    # -------------------------
    # prg_dataset_state
    # -------------------------
    op.create_table(
        "prg_dataset_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dataset_version", sa.String(length=64), nullable=True),
        sa.Column("dataset_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_import_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_delta_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_reconcile_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        schema=schema,
    )

    op.execute(f"""
        INSERT INTO {schema}.prg_dataset_state (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING;
    """)

    # -------------------------
    # prg_address_points
    # -------------------------
    op.create_table(
        "prg_address_points",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source", sa.String(length=32), nullable=False),  # PRG_OFFICIAL | PRG_LOCAL_PENDING
        sa.Column("prg_point_id", sa.String(length=64), nullable=True),
        sa.Column("local_point_id", sa.String(length=64), nullable=True),

        sa.Column("terc", sa.String(length=8), nullable=False),
        sa.Column("simc", sa.String(length=8), nullable=False),
        sa.Column("ulic", sa.String(length=8), nullable=True),
        sa.Column("no_street", sa.Boolean(), server_default=sa.text("false"), nullable=False),

        sa.Column("building_no", sa.String(length=32), nullable=False),
        sa.Column("building_no_norm", sa.String(length=32), nullable=False),
        sa.Column("local_no", sa.String(length=32), nullable=True),
        sa.Column("local_no_norm", sa.String(length=32), nullable=True),

        sa.Column("point", PGPoint(), nullable=False),

        sa.Column("note", sa.Text(), nullable=True),

        sa.Column("status", sa.String(length=32), server_default=sa.text("'active'"), nullable=False),
        sa.Column("merged_into_id", sa.Integer(), nullable=True),

        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_staff_id", sa.Integer(), nullable=True),
        sa.Column("resolved_by_job", sa.Boolean(), server_default=sa.text("false"), nullable=False),

        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),

        sa.ForeignKeyConstraint(
            ["merged_into_id"],
            [f"{schema}.prg_address_points.id"],
        ),
        schema=schema,
    )

    # unikalność PRG
    op.create_index(
        "uq_prg_address_points_prg_point_id",
        "prg_address_points",
        ["prg_point_id"],
        unique=True,
        schema=schema,
        postgresql_where=sa.text("prg_point_id IS NOT NULL"),
    )

    # unikalność lokalnych
    op.create_index(
        "uq_prg_address_points_local_point_id",
        "prg_address_points",
        ["local_point_id"],
        unique=True,
        schema=schema,
        postgresql_where=sa.text("local_point_id IS NOT NULL"),
    )

    # unikalność LOCAL_PENDING po normalizacji
    op.create_index(
        "uq_prg_local_pending_key",
        "prg_address_points",
        ["terc", "simc", "ulic", "building_no_norm", "local_no_norm"],
        unique=True,
        schema=schema,
        postgresql_where=sa.text("source='PRG_LOCAL_PENDING' AND status='active'"),
    )

    op.create_index(
        "ix_prg_points_lookup",
        "prg_address_points",
        ["source", "terc", "simc", "ulic", "building_no_norm"],
        unique=False,
        schema=schema,
    )

    # -------------------------
    # prg_reconcile_queue
    # -------------------------
    op.create_table(
        "prg_reconcile_queue",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("local_point_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("candidates", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_by_staff_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["local_point_id"],
            [f"{schema}.prg_address_points.id"],
            ondelete="CASCADE",
        ),
        schema=schema,
    )

    op.create_index(
        "ix_prg_reconcile_queue_pending",
        "prg_reconcile_queue",
        ["status", "created_at"],
        unique=False,
        schema=schema,
    )

    # -------------------------
    # RBAC actions PRG
    # -------------------------
    actions = [
        ("prg.import.run", "PRG: uruchom import", "Pozwala uruchomić ręcznie import/deltę PRG."),
        ("prg.local_point.create", "PRG: dodanie lokalnego punktu adresowego", "Dodaj lokalny punkt (LOCAL_PENDING)."),
        ("prg.local_point.edit", "PRG: edycja lokalnego punktu adresowego", "Edytuj lokalny punkt adresowy."),
        ("prg.local_point.delete", "PRG: usunięcie lokalnego punktu adresowego", "Usuń lokalny punkt (jeśli brak powiązań)."),
        ("prg.local_point.approve", "PRG: zatwierdzenie / merge", "Rozstrzyganie przypadków niepewnych."),
        ("prg.reconcile.run", "PRG: uruchom reconciliację", "Uruchom dopasowanie lokalnych punktów do PRG."),
    ]

    for code, label_pl, desc_pl in actions:
        op.execute(
            sa.text(f"""
                INSERT INTO {schema}.rbac_actions (code, label_pl, description_pl)
                VALUES (:code, :label, :desc)
                ON CONFLICT (code) DO NOTHING
            """).bindparams(code=code, label=label_pl, desc=desc_pl)
        )

    # admin ma zawsze wszystko
    op.execute(f"""
        INSERT INTO {schema}.rbac_role_actions (role_id, action_id)
        SELECT r.id, a.id
        FROM {schema}.rbac_roles r
        JOIN {schema}.rbac_actions a ON a.code IN (
            'prg.import.run',
            'prg.local_point.create',
            'prg.local_point.edit',
            'prg.local_point.delete',
            'prg.local_point.approve',
            'prg.reconcile.run'
        )
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING;
    """)


def downgrade() -> None:
    schema = "crm"

    # usuń powiązania ról
    op.execute(f"""
        DELETE FROM {schema}.rbac_role_actions
        WHERE action_id IN (
            SELECT id FROM {schema}.rbac_actions
            WHERE code IN (
                'prg.import.run',
                'prg.local_point.create',
                'prg.local_point.edit',
                'prg.local_point.delete',
                'prg.local_point.approve',
                'prg.reconcile.run'
            )
        );
    """)

    # usuń akcje
    op.execute(f"""
        DELETE FROM {schema}.rbac_actions
        WHERE code IN (
            'prg.import.run',
            'prg.local_point.create',
            'prg.local_point.edit',
            'prg.local_point.delete',
            'prg.local_point.approve',
            'prg.reconcile.run'
        );
    """)

    op.drop_index("ix_prg_reconcile_queue_pending", table_name="prg_reconcile_queue", schema=schema)
    op.drop_table("prg_reconcile_queue", schema=schema)

    op.drop_index("ix_prg_points_lookup", table_name="prg_address_points", schema=schema)
    op.drop_index("uq_prg_local_pending_key", table_name="prg_address_points", schema=schema)
    op.drop_index("uq_prg_address_points_local_point_id", table_name="prg_address_points", schema=schema)
    op.drop_index("uq_prg_address_points_prg_point_id", table_name="prg_address_points", schema=schema)
    op.drop_table("prg_address_points", schema=schema)

    op.drop_table("prg_dataset_state", schema=schema)
