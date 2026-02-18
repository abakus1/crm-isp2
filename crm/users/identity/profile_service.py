# crm/services/identity/profile_service.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import pyotp
import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from crm.db.models.staff import StaffUser, StaffUserMfa, AuditLog, ActivityLog
from crm.shared.request_context import get_request_context


class ProfileError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _get_totp_secret(db: Session, staff_user_id: int) -> Optional[str]:
    row = (
        db.query(StaffUserMfa)
        .filter(
            StaffUserMfa.staff_user_id == staff_user_id,
            StaffUserMfa.method == "totp",
            StaffUserMfa.enabled.is_(True),
        )
        .one_or_none()
    )
    return row.secret if row else None


def _audit(
    *,
    db: Session,
    staff_user_id: int,
    severity: str,
    action: str,
    entity_type: str,
    entity_id: str,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    ctx = get_request_context()
    db.add(
        AuditLog(
            staff_user_id=staff_user_id,
            severity=severity,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            request_id=ctx.request_id,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
            before=before,
            after=after,
            meta=meta,
        )
    )


def _activity(
    *,
    db: Session,
    staff_user_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    message: str,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        ActivityLog(
            staff_user_id=staff_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
            meta=meta,
        )
    )


def update_my_email(
    db: Session,
    *,
    actor: StaffUser,
    new_email: str,
    totp_code: str,
) -> StaffUser:
    """Zmiana emaila (self-service) z potwierdzeniem TOTP.

    Wymagania:
    - email unikalny w całym staff_users (admin+staff razem)
    - zmiana wymaga poprawnego TOTP na aktualnie włączonym sekrecie
    """

    email_norm = _normalize_email(new_email)
    if not email_norm or "@" not in email_norm:
        raise ProfileError("Nieprawidłowy email.")

    secret = _get_totp_secret(db, int(actor.id))
    if not secret:
        raise ProfileError("Brak skonfigurowanego TOTP — nie można zmienić emaila.")

    code = (totp_code or "").strip().replace(" ", "")
    if not code:
        raise ProfileError("Brak kodu TOTP.")

    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        raise ProfileError("Nieprawidłowy kod TOTP.")

    before = {"email": actor.email}

    # Pre-check (ładniejszy błąd niż IntegrityError)
    exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(StaffUser.id != actor.id)
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .first()
    )
    if exists:
        raise ProfileError("Email jest już zajęty.")

    actor.email = email_norm
    actor.updated_at = _now()

    _audit(
        db=db,
        staff_user_id=int(actor.id),
        severity="security",
        action="identity.self.email.update",
        entity_type="staff_user",
        entity_id=str(actor.id),
        before=before,
        after={"email": actor.email},
        meta=None,
    )
    _activity(
        db=db,
        staff_user_id=int(actor.id),
        action="identity.self.email.update",
        entity_type="staff_user",
        entity_id=str(actor.id),
        message="Zmieniono email (self-service)",
        meta=None,
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ProfileError("Email jest już zajęty.")

    db.refresh(actor)
    return actor
