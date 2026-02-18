"""grant auth_throttle to writer/reader

Revision ID: 857036966b22
Revises: 85879f265290
Create Date: 2026-02-15 19:13:06.424022

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '857036966b22'
down_revision: Union[str, Sequence[str], None] = '85879f265290'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("GRANT USAGE ON SCHEMA crm TO crm_writer, crm_reader;")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE crm.auth_throttle TO crm_writer;")
    op.execute("GRANT SELECT ON TABLE crm.auth_throttle TO crm_reader;")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO crm_writer, crm_reader;")


def downgrade() -> None:
    op.execute("REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE crm.auth_throttle FROM crm_writer;")
    op.execute("REVOKE SELECT ON TABLE crm.auth_throttle FROM crm_reader;")
