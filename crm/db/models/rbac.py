from __future__ import annotations

from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from crm.db.models.base import Base


SCHEMA = "crm"


class RbacRole(Base):
    __tablename__ = "rbac_roles"
    __table_args__ = (
        sa.UniqueConstraint("code", name="uq_rbac_roles_code"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(64), nullable=False)
    label_pl: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    description_pl: Mapped[str] = mapped_column(sa.String(500), nullable=False, server_default=sa.text("''"))

    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))


class RbacAction(Base):
    __tablename__ = "rbac_actions"
    __table_args__ = (
        sa.UniqueConstraint("code", name="uq_rbac_actions_code"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(sa.String(128), nullable=False)
    label_pl: Mapped[str] = mapped_column(sa.String(160), nullable=False)
    description_pl: Mapped[str] = mapped_column(sa.String(700), nullable=False, server_default=sa.text("''"))

    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))


class RbacRoleAction(Base):
    __tablename__ = "rbac_role_actions"
    __table_args__ = (
        sa.UniqueConstraint("role_id", "action_id", name="uq_rbac_role_actions_role_action"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    role_id: Mapped[int] = mapped_column(sa.BigInteger, sa.ForeignKey(f"{SCHEMA}.rbac_roles.id", ondelete="CASCADE"), nullable=False)
    action_id: Mapped[int] = mapped_column(sa.BigInteger, sa.ForeignKey(f"{SCHEMA}.rbac_actions.id", ondelete="CASCADE"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))


class StaffActionOverride(Base):
    __tablename__ = "staff_action_overrides"
    __table_args__ = (
        sa.UniqueConstraint("staff_user_id", "action_id", name="uq_staff_action_overrides_staff_action"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)
    staff_user_id: Mapped[int] = mapped_column(sa.BigInteger, sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="CASCADE"), nullable=False)
    action_id: Mapped[int] = mapped_column(sa.BigInteger, sa.ForeignKey(f"{SCHEMA}.rbac_actions.id", ondelete="CASCADE"), nullable=False)
    # allow | deny
    effect: Mapped[str] = mapped_column(sa.String(8), nullable=False)

    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))
