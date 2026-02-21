# crm/users/identity/auth_setup.py
from __future__ import annotations

from typing import Any, Dict, Optional

import pyotp
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
    settings,
)


def setup_change_password(
    db: Session,
    *,
    actor: StaffUser,
    new_password: str,
    new_password_repeat: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    if not bool(getattr(actor, "must_change_credentials", False)):
        raise AuthError("Zmiana hasła nie jest wymagana.")
    if new_password != new_password_repeat:
        raise AuthError("Hasła nie są identyczne.")
    if len(new_password.encode("utf-8")) > 72:
        raise AuthError("Hasło za długie (limit 72 bajty). Skróć hasło.")

    before = {"must_change_credentials": bool(getattr(actor, "must_change_credentials", False))}

    now = _utcnow()
    actor.password_hash = _pwd.hash(new_password)
    actor.password_changed_at = now
    actor.must_change_credentials = True
    actor.updated_at = now

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SETUP_PASSWORD_CHANGED",
        entity_type="staff_users",
        entity_id=str(actor.id),
        before=before,
        after={"must_change_credentials": True},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SETUP_PASSWORD_CHANGED",
        message="Setup: zmieniono hasło (wymuszona zmiana)",
        meta={"username": actor.username},
        target_type="staff_users",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "relogin_required": False}


def setup_totp_begin(
    db: Session,
    *,
    actor: StaffUser,
    label_username: Optional[str] = None,
    totp_secret: Optional[str] = None,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    if not bool(getattr(actor, "must_change_credentials", False)):
        raise AuthError("Nie jesteś w trybie setup.")
    if not bool(getattr(actor, "mfa_required", False)):
        raise AuthError("MFA nie jest wymagane dla tego konta.")

    sec = (totp_secret or pyotp.random_base32()).strip()
    if len(sec) < 16:
        raise AuthError("Nieprawidłowy secret TOTP.")

    # onboarding: seeded disabled
    _begin_totp_change(db, int(actor.id), sec)

    label = (label_username or actor.username or "user").strip()
    uri = pyotp.TOTP(sec).provisioning_uri(name=label, issuer_name=settings.auth_totp_issuer)

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SETUP_TOTP_BEGIN",
        entity_type="staff_user_mfa",
        entity_id=str(actor.id),
        before={"totp_enabled": False},
        after={"totp_pending": True},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SETUP_TOTP_BEGIN",
        message="Setup: wygenerowano TOTP (pending)",
        meta={"label": label},
        target_type="staff_user_mfa",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "totp_secret": sec, "totp_uri": uri}


def setup_enable_totp(
    db: Session,
    *,
    actor: StaffUser,
    totp_code: str,
    secret: str,
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> Dict[str, Any]:
    if not bool(getattr(actor, "mfa_required", False)):
        raise AuthError("MFA nie jest wymagane dla tego konta.")

    _confirm_totp_change(db, int(actor.id), secret, totp_code)

    now = _utcnow()
    actor.must_change_credentials = False
    actor.token_version += 1
    actor.updated_at = now

    _log_audit(
        db,
        staff_user_id=int(actor.id),
        ip=actor_ip,
        action="SETUP_TOTP_ENABLED",
        entity_type="staff_users",
        entity_id=str(actor.id),
        before={"totp_enabled": False},
        after={"totp_enabled": True, "must_change_credentials": False},
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        staff_user_id=int(actor.id),
        action="SETUP_TOTP_ENABLED",
        message="Setup: włączono TOTP",
        meta={"username": actor.username},
        target_type="staff_users",
        target_id=str(actor.id),
    )

    db.commit()
    return {"status": "ok", "relogin_required": True}