# crm/users/identity/auth_bootstrap.py
from __future__ import annotations

from typing import Any, Dict, Optional

import pyotp
import sqlalchemy as sa
from sqlalchemy.orm import Session

from crm.db.models.staff import StaffUser
from crm.users.identity.auth_common import (
    AuthError,
    _begin_totp_change,
    _confirm_totp_change,
    _get_bootstrap_state,
    _get_mfa_row,
    _log_activity,
    _log_audit,
    _pwd,
    _utcnow,
    settings,
)


def bootstrap_begin(
    db: Session,
    *,
    actor_staff_id: int,
    label_username: Optional[str],
    totp_secret: Optional[str],
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    state = _get_bootstrap_state(db)
    if not state.bootstrap_required:
        raise AuthError("Bootstrap już zakończony.")

    admin = db.query(StaffUser).filter(StaffUser.id == actor_staff_id).one_or_none()
    if not admin or str(admin.role) != "admin":
        raise AuthError("Tylko admin może rozpocząć bootstrap.")

    secret = (totp_secret or pyotp.random_base32()).strip()
    if not secret:
        raise AuthError("Nie udało się wygenerować secreta TOTP.")

    # bootstrap: jeśli istnieje aktywny totp (raczej nie), użyj pending. Jeśli nie ma, seeded disabled.
    _begin_totp_change(db, int(admin.id), secret)

    label = (label_username or admin.username or "admin").strip()
    uri = pyotp.TOTP(secret).provisioning_uri(name=label, issuer_name=settings.auth_totp_issuer)

    _log_audit(
        db,
        staff_user_id=int(admin.id),
        ip=actor_ip,
        action="BOOTSTRAP_BEGIN",
        entity_type="system_bootstrap_state",
        entity_id="1",
        before={"bootstrap_required": True},
        after={"bootstrap_required": True, "totp_pending": True},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(admin.id),
        action="BOOTSTRAP_BEGIN",
        message="Bootstrap (BEGIN): wygenerowano TOTP (pending)",
        meta={"label": label},
        target_type="system_bootstrap_state",
        target_id="1",
    )

    db.commit()

    return {
        "status": "ok",
        "admin_id": int(admin.id),
        "admin_username": admin.username,
        "totp_secret": secret,
        "totp_uri": uri,
        "bootstrap_required": True,
        "completed_at": None,
        "next": "/identity/bootstrap/confirm",
    }


def bootstrap_confirm(
    db: Session,
    *,
    actor_staff_id: int,
    totp_code: str,
    new_username: str,
    email: str,
    new_password: str,
    new_password_repeat: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    state = _get_bootstrap_state(db)
    if not state.bootstrap_required:
        raise AuthError("Bootstrap już zakończony.")

    admin = db.query(StaffUser).filter(StaffUser.id == actor_staff_id).one_or_none()
    if not admin or str(admin.role) != "admin":
        raise AuthError("Tylko admin może potwierdzić bootstrap.")

    email_norm = (email or "").strip().lower()
    if not email_norm or "@" not in email_norm or len(email_norm) > 255:
        raise AuthError("Nieprawidłowy email.")

    exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(StaffUser.id != admin.id)
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .first()
    )
    if exists:
        raise AuthError("Email jest już zajęty.")

    new_username = (new_username or "").strip()
    if not new_username or len(new_username) > 64:
        raise AuthError("Nieprawidłowy username.")

    if new_password != new_password_repeat:
        raise AuthError("Hasła nie są identyczne.")
    if len(new_password.encode("utf-8")) > 72:
        raise AuthError("Hasło za długie (limit 72 bajty). Skróć hasło.")

    # secret do confirm: w bootstrap mamy zwykle seeded disabled -> secret siedzi w kolumnie secret przy enabled=False
    mfa_row = _get_mfa_row(db, int(admin.id))
    if not mfa_row:
        raise AuthError("Brak secreta TOTP. Wykonaj /identity/bootstrap (BEGIN) jeszcze raz.")

    # weryfikuj kod przeciwko temu secretowi (pending/seed)
    sec = (mfa_row.pending_secret or mfa_row.secret or "").strip()
    if not sec:
        raise AuthError("Brak secreta TOTP. Wykonaj /identity/bootstrap (BEGIN) jeszcze raz.")

    _confirm_totp_change(db, int(admin.id), sec, totp_code)

    before_admin = {"username": admin.username, "email": admin.email}

    now = _utcnow()
    admin.username = new_username
    admin.email = email_norm
    admin.password_hash = _pwd.hash(new_password)
    admin.password_changed_at = now
    admin.must_change_credentials = False
    admin.mfa_required = True
    admin.updated_at = now

    state.bootstrap_required = False
    state.completed_at = now
    state.completed_by_staff_id = int(admin.id)
    state.updated_at = now

    admin.token_version += 1
    admin.updated_at = now

    _log_audit(
        db,
        staff_user_id=int(admin.id),
        ip=actor_ip,
        action="BOOTSTRAP_CONFIRM",
        entity_type="system_bootstrap_state",
        entity_id="1",
        before={"bootstrap_required": True, "admin": before_admin},
        after={
            "bootstrap_required": False,
            "completed_at": now.isoformat(),
            "admin": {"username": admin.username, "email": admin.email},
            "totp_enabled": True,
        },
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(admin.id),
        action="BOOTSTRAP_CONFIRM",
        message="Bootstrap (CONFIRM): ustawiono dane admina, potwierdzono TOTP i zakończono bootstrap",
        meta={"username": admin.username, "email": admin.email},
        target_type="system_bootstrap_state",
        target_id="1",
    )

    db.commit()

    return {"status": "ok", "bootstrap_required": False, "relogin_required": True, "message": "Bootstrap zakończony — zaloguj się ponownie."}


# ============================================================
# BOOTSTRAP (LEGACY - kept for compatibility)
# ============================================================


def bootstrap_complete(
    db: Session,
    *,
    actor_staff_id: int,
    new_username: str,
    email: str,
    new_password: str,
    new_password_repeat: str,
    totp_secret: Optional[str],
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    state = _get_bootstrap_state(db)
    if not state.bootstrap_required:
        raise AuthError("Bootstrap już zakończony.")

    admin = db.query(StaffUser).filter(StaffUser.id == actor_staff_id).one_or_none()
    if not admin or str(admin.role) != "admin":
        raise AuthError("Tylko admin może kończyć bootstrap.")

    email_norm = (email or "").strip().lower()
    if not email_norm or "@" not in email_norm or len(email_norm) > 255:
        raise AuthError("Nieprawidłowy email.")

    exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(StaffUser.id != admin.id)
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .first()
    )
    if exists:
        raise AuthError("Email jest już zajęty.")

    new_username = (new_username or "").strip()
    if not new_username or len(new_username) > 64:
        raise AuthError("Nieprawidłowy username.")

    if new_password != new_password_repeat:
        raise AuthError("Hasła nie są identyczne.")
    if len(new_password.encode("utf-8")) > 72:
        raise AuthError("Hasło za długie (limit 72 bajty). Skróć hasło.")

    before_admin = {"username": admin.username, "email": admin.email}

    now = _utcnow()
    admin.username = new_username
    admin.email = email_norm
    admin.password_hash = _pwd.hash(new_password)
    admin.password_changed_at = now
    admin.must_change_credentials = False
    admin.mfa_required = True
    admin.updated_at = now

    secret = (totp_secret or pyotp.random_base32()).strip()
    _begin_totp_change(db, int(admin.id), secret)

    _log_audit(
        db,
        staff_user_id=int(admin.id),
        ip=actor_ip,
        action="BOOTSTRAP_PHASE_A",
        entity_type="system_bootstrap_state",
        entity_id="1",
        before={"bootstrap_required": True, "admin": before_admin},
        after={"bootstrap_required": True, "admin": {"username": admin.username, "email": admin.email}, "totp_pending": True},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(admin.id),
        action="BOOTSTRAP_PHASE_A",
        message="Bootstrap (A): ustawiono username/email/hasło, wygenerowano TOTP (pending)",
        meta={"username": admin.username, "email": admin.email},
        target_type="system_bootstrap_state",
        target_id="1",
    )

    db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(name=admin.username, issuer_name=settings.auth_totp_issuer)

    return {
        "status": "ok",
        "admin_id": int(admin.id),
        "admin_username": admin.username,
        "totp_secret": secret,
        "totp_uri": uri,
        "bootstrap_required": True,
        "completed_at": None,
        "next": "/identity/bootstrap/totp/confirm",
    }


def bootstrap_confirm_totp(
    db: Session,
    *,
    actor_staff_id: int,
    totp_code: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    state = _get_bootstrap_state(db)
    if not state.bootstrap_required:
        raise AuthError("Bootstrap już zakończony.")

    actor = db.query(StaffUser).filter(StaffUser.id == actor_staff_id).one_or_none()
    if not actor or str(actor.role) != "admin":
        raise AuthError("Tylko admin może potwierdzić TOTP w bootstrapie.")

    row = _get_mfa_row(db, int(actor.id))
    if not row:
        raise AuthError("Brak secreta TOTP. Wykonaj bootstrap (A) jeszcze raz.")

    sec = (row.pending_secret or row.secret or "").strip()
    if not sec:
        raise AuthError("Brak secreta TOTP. Wykonaj bootstrap (A) jeszcze raz.")

    _confirm_totp_change(db, int(actor.id), sec, totp_code)

    now = _utcnow()
    state.bootstrap_required = False
    state.completed_at = now
    state.completed_by_staff_id = int(actor.id)
    state.updated_at = now

    actor.token_version += 1
    actor.updated_at = now

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="BOOTSTRAP_PHASE_B_TOTP_CONFIRMED",
        entity_type="system_bootstrap_state",
        entity_id="1",
        before={"bootstrap_required": True},
        after={"bootstrap_required": False, "completed_at": now.isoformat()},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="BOOTSTRAP_PHASE_B_TOTP_CONFIRMED",
        message="Bootstrap (B): potwierdzono TOTP i zakończono bootstrap",
        meta={"username": actor.username, "email": actor.email},
        target_type="system_bootstrap_state",
        target_id="1",
    )

    db.commit()

    return {"status": "ok", "bootstrap_required": False, "relogin_required": True, "message": "TOTP potwierdzone. Bootstrap zakończony — zaloguj się ponownie."}