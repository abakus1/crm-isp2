# crm/db/models/staff.py
from __future__ import annotations

from datetime import datetime, date
from typing import Optional, Dict, Any, List

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base

SCHEMA = "crm"

# DB: crm.staff_role (historycznie ENUM), crm.staff_status, crm.mfa_method, crm.audit_severity
# Uwaga: role w CRM rozwijamy jako dane (RBAC w DB), więc kolumna staff_users.role jest TEXT/VARCHAR.
# ENUM staff_role może dalej istnieć w DB jako legacy, ale nie jest już źródłem prawdy.
StaffRole = postgresql.ENUM(
    "admin",
    "staff",
    name="staff_role",
    schema=SCHEMA,
    create_type=False,
)

StaffStatus = postgresql.ENUM(
    "active",
    "disabled",
    "archived",
    name="staff_status",
    schema=SCHEMA,
    create_type=False,
)

MfaMethod = postgresql.ENUM(
    "totp",
    name="mfa_method",
    schema=SCHEMA,
    create_type=False,
)

AuditSeverity = postgresql.ENUM(
    "info",
    "warning",
    "security",
    "critical",
    name="audit_severity",
    schema=SCHEMA,
    create_type=False,
)


class StaffUser(Base):
    __tablename__ = "staff_users"
    __table_args__ = {"schema": SCHEMA}

    def set_password(self, new_password: str) -> None:
        # Lokalny import, żeby uniknąć cykli importów przy starcie aplikacji
        from crm.users.identity.auth_service import _pwd

        self.password_hash = _pwd.hash(new_password)

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)

    username: Mapped[str] = mapped_column(sa.String(64), nullable=False, unique=True)
    email: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)

    # -------------------------
    # PROFILE (dane pracownika) - nowe, opcjonalne
    # -------------------------
    first_name: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(sa.String(120), nullable=True)
    phone_company: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)

    job_title: Mapped[Optional[str]] = mapped_column(sa.String(120), nullable=True)

    birth_date: Mapped[Optional[date]] = mapped_column(sa.Date, nullable=True)
    pesel: Mapped[Optional[str]] = mapped_column(sa.String(11), nullable=True)
    id_document_no: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)

    # Legacy: tekstowe adresy (dla UI/eksportów) — utrzymujemy kompatybilność.
    address_registered: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address_current: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Canon: PRG/ADRUNI (TERC/SIMC/ULIC + nazwy + numer)
    # --- Zameldowanie ---
    address_registered_prg_place_name: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address_registered_prg_terc: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_registered_prg_simc: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_registered_prg_street_name: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address_registered_prg_ulic: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_registered_prg_building_no: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)
    address_registered_prg_local_no: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)

    # Poczta (nie zawsze pokrywa się z nazwą miejscowości)
    address_registered_postal_code: Mapped[Optional[str]] = mapped_column(sa.String(16), nullable=True)
    address_registered_post_city: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # --- Zamieszkanie ---
    address_current_prg_place_name: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address_current_prg_terc: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_current_prg_simc: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_current_prg_street_name: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    address_current_prg_ulic: Mapped[Optional[str]] = mapped_column(sa.String(8), nullable=True)
    address_current_prg_building_no: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)
    address_current_prg_local_no: Mapped[Optional[str]] = mapped_column(sa.String(32), nullable=True)

    # Poczta (nie zawsze pokrywa się z nazwą miejscowości)
    address_current_postal_code: Mapped[Optional[str]] = mapped_column(sa.String(16), nullable=True)
    address_current_post_city: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    address_current_same_as_registered: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )

    # ✅ rola jako string (RBAC w DB)
    role: Mapped[str] = mapped_column(
        sa.String(64),
        nullable=False,
        server_default="admin",
    )

    status: Mapped[str] = mapped_column(
        StaffStatus,
        nullable=False,
        server_default="active",
    )

    token_version: Mapped[int] = mapped_column(
        sa.Integer,
        nullable=False,
        server_default=sa.text("1"),
    )

    password_hash: Mapped[str] = mapped_column(sa.Text, nullable=False)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    must_change_credentials: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )

    mfa_required: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )

    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    last_seen_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    # -------------------------
    # DISABLED METADATA
    # -------------------------

    disabled_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    disabled_reason: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )

    disabled_source: Mapped[Optional[str]] = mapped_column(
        sa.String(32),
        nullable=True,
    )

    disabled_by_staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # -------------------------
    # ARCHIVED METADATA
    # -------------------------

    archived_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    archived_reason: Mapped[Optional[str]] = mapped_column(
        sa.Text,
        nullable=True,
    )

    archived_by_staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # -------------------------
    # RELATIONSHIPS
    # -------------------------

    mfa: Mapped[List["StaffUserMfa"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class StaffUserMfa(Base):
    __tablename__ = "staff_user_mfa"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)

    staff_user_id: Mapped[int] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="CASCADE"),
        nullable=False,
    )

    method: Mapped[str] = mapped_column(
        MfaMethod,
        nullable=False,
        server_default="totp",
    )

    # aktywny secret (ten używany do logowania) — NOT NULL (jak w migracji)
    secret: Mapped[str] = mapped_column(sa.Text, nullable=False)

    enabled: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )

    # ✅ pending TOTP (do zmiany / pierwszej konfiguracji)
    pending_secret: Mapped[Optional[str]] = mapped_column(
        sa.String(128),
        nullable=True,
    )

    pending_created_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    user: Mapped["StaffUser"] = relationship(back_populates="mfa")


class SystemBootstrapState(Base):
    __tablename__ = "system_bootstrap_state"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.SmallInteger, primary_key=True)

    bootstrap_required: Mapped[bool] = mapped_column(
        sa.Boolean,
        nullable=False,
        server_default=sa.text("true"),
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=True,
    )

    completed_by_staff_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


class AuditLog(Base):
    __tablename__ = "audit_log"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)

    occurred_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    severity: Mapped[str] = mapped_column(
        AuditSeverity,
        nullable=False,
        server_default="info",
    )

    action: Mapped[str] = mapped_column(sa.String(120), nullable=False)

    entity_type: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)

    request_id: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(postgresql.INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    before: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        postgresql.JSONB(astext_type=sa.Text),
        nullable=True,
    )
    after: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        postgresql.JSONB(astext_type=sa.Text),
        nullable=True,
    )
    meta: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        postgresql.JSONB(astext_type=sa.Text),
        nullable=True,
    )


class ActivityLog(Base):
    __tablename__ = "activity_log"
    __table_args__ = {"schema": SCHEMA}

    id: Mapped[int] = mapped_column(sa.BigInteger, primary_key=True)

    occurred_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    staff_user_id: Mapped[Optional[int]] = mapped_column(
        sa.BigInteger,
        sa.ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    action: Mapped[str] = mapped_column(sa.String(120), nullable=False)

    # zgodnie z migracją: entity_* (a nie target_*)
    entity_type: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(sa.String(80), nullable=True)

    message: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    meta: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        postgresql.JSONB(astext_type=sa.Text),
        nullable=True,
    )