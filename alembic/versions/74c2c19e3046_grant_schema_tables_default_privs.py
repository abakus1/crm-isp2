"""grant_schema_tables_default_privs

Revision ID: 74c2c19e3046
Revises: 857036966b22
Create Date: 2026-02-15 20:41:50.791287

"""
from typing import Sequence, Union
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74c2c19e3046'
down_revision: Union[str, Sequence[str], None] = '857036966b22'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema usage
    op.execute("GRANT USAGE ON SCHEMA crm TO crm_writer, crm_reader;")

    # Existing tables
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO crm_writer;")
    op.execute("GRANT SELECT ON ALL TABLES IN SCHEMA crm TO crm_reader;")

    # Sequences (serial/bigserial)
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO crm_writer, crm_reader;")

    # Default privileges for objects CREATED BY crm_admin in schema crm
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE crm_admin IN SCHEMA crm "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_writer;"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE crm_admin IN SCHEMA crm "
        "GRANT SELECT ON TABLES TO crm_reader;"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES FOR ROLE crm_admin IN SCHEMA crm "
        "GRANT USAGE, SELECT ON SEQUENCES TO crm_writer, crm_reader;"
    )


def downgrade() -> None:
    # Nie próbujemy “cofać” default privileges granularnie, bo:
    # - jest to migracja infrastrukturalna
    # - downgrade w praktyce nie ma sensu operacyjnego
    # Zostawiamy bezpieczne REVOKE na aktualnych obiektach.

    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm FROM crm_writer;")
    op.execute("REVOKE SELECT ON ALL TABLES IN SCHEMA crm FROM crm_reader;")
    op.execute("REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm FROM crm_writer, crm_reader;")
