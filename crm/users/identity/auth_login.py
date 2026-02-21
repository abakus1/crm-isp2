# crm/users/identity/auth_login.py
from __future__ import annotations

from typing import Optional

import pyotp
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session

from crm.db.models.staff import StaffUser
from crm.users.identity.auth_common import (
    AuthError,
    AuthResult,
    _get_bootstrap_state,
    _get_totp_secret,
    _is_bootstrap_placeholder_hash,
    _log_activity,
    _make_access_token,
    _pwd,
    _set_if_exists,
    _utcnow,
    settings,
)


def authenticate_login(
    db: Session,
    *,
    username: str,
    password: str,
    totp_code: Optional[str],
    actor_ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> AuthResult:
    uname = (username or "").strip()
    if not uname:
        raise AuthError("Brak username.")

    user = db.query(StaffUser).filter(StaffUser.username == uname).one_or_none()
    if not user:
        raise AuthError("Nieprawidłowy login lub hasło.")

    if str(user.status) != "active":
        raise AuthError("Konto jest nieaktywne.")

    if not user.password_hash:
        raise AuthError("Konto nie ma ustawionego hasła.")

    state = _get_bootstrap_state(db)
    bootstrap_mode = bool(state.bootstrap_required and str(user.role) == "admin")

    if _is_bootstrap_placeholder_hash(user.password_hash):
        if str(user.role) != "admin" or not bootstrap_mode:
            raise AuthError("Nieprawidłowy login lub hasło.")
        bootstrap_password = getattr(settings, "bootstrap_password", None) or "admin"
        if password != bootstrap_password:
            raise AuthError("Nieprawidłowy login lub hasło.")
    else:
        try:
            ok = _pwd.verify(password, user.password_hash)
        except UnknownHashError:
            ok = False
        if not ok:
            raise AuthError("Nieprawidłowy login lub hasło.")

    token_version = int(getattr(user, "token_version", 0) or 0)

    must_change = bool(getattr(user, "must_change_credentials", False) or False)
    has_active_totp = bool(_get_totp_secret(db, int(user.id)))
    setup_mode = bool(must_change or (bool(getattr(user, "mfa_required", False)) and not has_active_totp))

    if not bootstrap_mode and bool(getattr(user, "mfa_required", False)):
        secret = _get_totp_secret(db, int(user.id))
        code = (totp_code or "").strip().replace(" ", "")

        if secret:
            if not code:
                raise AuthError("Brak kodu TOTP.")
            if not pyotp.TOTP(secret).verify(code, valid_window=1):
                raise AuthError("Nieprawidłowy kod TOTP.")
        else:
            if not setup_mode:
                raise AuthError("MFA wymagane, ale brak skonfigurowanego TOTP.")

    now = _utcnow()
    _set_if_exists(user, "last_seen_at", now)
    _set_if_exists(user, "last_login_at", now)
    user.updated_at = now

    _log_activity(
        db,
        staff_user_id=int(user.id),
        action="LOGIN_OK",
        message="Zalogowano poprawnie",
        meta={"username": user.username, "role": str(user.role), "bootstrap_mode": bootstrap_mode, "setup_mode": setup_mode},
        target_type="staff_users",
        target_id=str(user.id),
    )

    token = _make_access_token(
        subject=str(user.id),
        extra_claims={
            "username": user.username,
            "role": str(user.role),
            "tv": token_version,
            "token_version": token_version,
            "bootstrap_mode": bootstrap_mode,
            "setup_mode": setup_mode,
        },
    )

    db.commit()

    return AuthResult(
        access_token=token,
        token_type="bearer",
        staff_id=int(user.id),
        username=user.username,
        role=str(user.role),
        bootstrap_mode=bootstrap_mode,
        setup_mode=setup_mode,
        must_change_credentials=bool(getattr(user, "must_change_credentials", False) or False),
        mfa_required=bool(getattr(user, "mfa_required", False) or False),
    )