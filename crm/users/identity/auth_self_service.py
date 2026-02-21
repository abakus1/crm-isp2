# crm/users/identity/auth_self_service.py
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
    _log_activity,
    _log_audit,
    _pwd,
    _utcnow,
    _verify_current_password,
    _verify_current_totp,
    settings,
)


def self_change_password(
    db: Session,
    *,
    actor: StaffUser,
    current_password: str,
    new_password: str,
    new_password_repeat: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    _verify_current_password(actor, current_password)

    if new_password != new_password_repeat:
        raise AuthError("Hasła nie są takie same.")
    if new_password == current_password:
        raise AuthError("Nowe hasło musi być inne niż obecne.")
    if len(new_password.encode("utf-8")) > 72:
        raise AuthError("Hasło za długie (limit 72 bajty). Skróć hasło.")

    before = {
        "token_version": int(actor.token_version),
        "password_changed_at": actor.password_changed_at.isoformat() if actor.password_changed_at else None,
    }

    now = _utcnow()
    actor.password_hash = _pwd.hash(new_password)
    actor.password_changed_at = now
    actor.must_change_credentials = False
    actor.token_version = int(actor.token_version) + 1
    actor.updated_at = now

    after = {
        "token_version": int(actor.token_version),
        "password_changed_at": actor.password_changed_at.isoformat() if actor.password_changed_at else None,
    }

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SELF_PASSWORD_CHANGED",
        entity_type="staff_users",
        entity_id=str(actor.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="security",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SELF_PASSWORD_CHANGED",
        message="Zmieniono hasło (self-service)",
        meta={"username": actor.username},
        target_type="staff_users",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "relogin_required": True}


def self_totp_reset_begin(
    db: Session,
    *,
    actor: StaffUser,
    current_password: str,
    label_username: Optional[str] = None,
    totp_secret: Optional[str] = None,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    _verify_current_password(actor, current_password)

    sec = (totp_secret or pyotp.random_base32()).strip()
    if len(sec) < 16:
        raise AuthError("Nieprawidłowy secret TOTP.")

    label = (label_username or actor.username or "user").strip()
    uri = pyotp.TOTP(sec).provisioning_uri(name=label, issuer_name=getattr(settings, "auth_totp_issuer", "CRM"))

    # ✅ KLUCZ: jeśli user ma aktywny TOTP, nie wyłączamy go — ustawiamy pending_secret
    _begin_totp_change(db, int(actor.id), sec)

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SELF_TOTP_RESET_BEGIN",
        entity_type="staff_user_mfa",
        entity_id=str(actor.id),
        before={"totp_enabled": True},
        after={"totp_pending": True},
        request_id=request_id,
        user_agent=user_agent,
        severity="security",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SELF_TOTP_RESET_BEGIN",
        message="Rozpoczęto reset TOTP (self-service)",
        meta={"username": actor.username},
        target_type="staff_user_mfa",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "totp_secret": sec, "totp_uri": uri, "next": "/identity/me/totp/reset/confirm"}


def self_totp_reset_confirm(
    db: Session,
    *,
    actor: StaffUser,
    totp_code: str,
    totp_secret: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    # confirm: promujemy pending -> active (albo enabled False -> True)
    _confirm_totp_change(db, int(actor.id), totp_secret, totp_code)

    before = {"token_version": int(actor.token_version)}
    actor.token_version = int(actor.token_version) + 1
    actor.updated_at = _utcnow()
    after = {"token_version": int(actor.token_version)}

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SELF_TOTP_RESET_CONFIRM",
        entity_type="staff_users",
        entity_id=str(actor.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SELF_TOTP_RESET_CONFIRM",
        message="Zresetowano i potwierdzono TOTP (self-service)",
        meta={"username": actor.username},
        target_type="staff_users",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "relogin_required": True}


def self_update_email(
    db: Session,
    *,
    actor: StaffUser,
    new_email: str,
    current_password: str,
    totp_code: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    _verify_current_password(actor, current_password)
    _verify_current_totp(db, staff_user_id=int(actor.id), totp_code=totp_code)

    email_norm = (new_email or "").strip().lower()
    if not email_norm or "@" not in email_norm or len(email_norm) > 255:
        raise AuthError("Nieprawidłowy email.")

    email_exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .filter(StaffUser.id != int(actor.id))
        .first()
    )
    if email_exists:
        raise AuthError("Taki email już istnieje.")

    before = {"email": actor.email, "token_version": int(actor.token_version)}

    actor.email = email_norm
    actor.token_version = int(actor.token_version) + 1
    actor.updated_at = _utcnow()

    after = {"email": actor.email, "token_version": int(actor.token_version)}

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SELF_EMAIL_UPDATED",
        entity_type="staff_users",
        entity_id=str(actor.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="security",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SELF_EMAIL_UPDATED",
        message="Zmieniono email (self-service)",
        meta={"username": actor.username, "email": actor.email},
        target_type="staff_users",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "relogin_required": True}