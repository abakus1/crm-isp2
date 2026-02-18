# crm/services/identity/auth_service.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import pyotp
import sqlalchemy as sa
from jose import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.models.staff import ActivityLog, AuditLog, StaffUser, StaffUserMfa, SystemBootstrapState

settings = get_settings()

_pwd = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
)


class AuthError(RuntimeError):
    pass


# ============================================================
# SELF-SERVICE (admin/staff)
# ============================================================

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _set_if_exists(obj: object, field: str, value: Any) -> None:
    if hasattr(obj, field):
        setattr(obj, field, value)


def _is_bootstrap_placeholder_hash(password_hash: str) -> bool:
    h = (password_hash or "")
    return h.startswith("__BOOTSTRAP_")


def _verify_current_password(user: StaffUser, password: str) -> None:
    if _is_bootstrap_placeholder_hash(user.password_hash):
        raise AuthError("Konto jest w trybie bootstrap — operacja niedostępna.")
    try:
        ok = _pwd.verify(password, user.password_hash)
    except UnknownHashError:
        ok = False
    if not ok:
        raise AuthError("Nieprawidłowe hasło.")


# ============================================================
# AUDIT / ACTIVITY
# ============================================================

def _log_audit(
    db: Session,
    *,
    staff_user_id: int,
    ip: Optional[str],
    action: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
    before: Optional[Dict[str, Any]],
    after: Optional[Dict[str, Any]],
    request_id: Optional[str],
    user_agent: Optional[str],
    severity: str = "info",
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    now = _utcnow()
    db.add(
        AuditLog(
            occurred_at=now,
            staff_user_id=staff_user_id,
            severity=severity,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            ip=ip,
            before=before,
            after=after,
            meta=meta,
            request_id=request_id,
            user_agent=user_agent,
        )
    )


def _log_activity(
    db: Session,
    *,
    staff_user_id: int,
    action: str,
    message: str,
    meta: Optional[Dict[str, Any]] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
) -> None:
    now = _utcnow()
    db.add(
        ActivityLog(
            occurred_at=now,
            staff_user_id=staff_user_id,
            action=action,
            entity_type=target_type,
            entity_id=target_id,
            message=message,
            meta=meta,
        )
    )


# ============================================================
# JWT
# ============================================================

@dataclass
class AuthResult:
    access_token: str
    token_type: str
    staff_id: int
    username: str
    role: str
    bootstrap_mode: bool
    setup_mode: bool
    must_change_credentials: bool
    mfa_required: bool


def _make_access_token(*, subject: str, extra_claims: Dict[str, Any]) -> str:
    now = _utcnow()
    exp = now + timedelta(minutes=int(settings.auth_access_token_minutes))
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        **extra_claims,
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm=settings.auth_jwt_alg)


# ============================================================
# BOOTSTRAP STATE + MFA HELPERS
# ============================================================

def _get_bootstrap_state(db: Session) -> SystemBootstrapState:
    state = db.get(SystemBootstrapState, 1)
    if not state:
        raise AuthError("Brak system_bootstrap_state(id=1).")
    return state


def _get_mfa_row(db: Session, staff_user_id: int) -> Optional[StaffUserMfa]:
    return (
        db.query(StaffUserMfa)
        .filter(StaffUserMfa.staff_user_id == staff_user_id, StaffUserMfa.method == "totp")
        .order_by(StaffUserMfa.id.desc())
        .one_or_none()
    )


def _get_totp_secret(db: Session, staff_user_id: int) -> Optional[str]:
    """
    Aktywny secret tylko gdy enabled=True
    """
    row = _get_mfa_row(db, staff_user_id)
    if not row:
        return None
    if not bool(row.enabled):
        return None
    return row.secret


def _get_totp_pending_secret(db: Session, staff_user_id: int) -> Optional[str]:
    row = _get_mfa_row(db, staff_user_id)
    if not row:
        return None
    return (row.pending_secret or None)


def _begin_totp_change(db: Session, staff_user_id: int, new_secret: str) -> Dict[str, Any]:
    """
    Start zmiany TOTP:
    - jeśli istnieje aktywny TOTP: zapisujemy pending_secret (NIE ruszamy secret/enabled)
    - jeśli nie ma rekordu: tworzymy rekord z enabled=False i secret=new_secret (pierwsza konfiguracja)
    """
    now = _utcnow()
    row = _get_mfa_row(db, staff_user_id)

    if row:
        if bool(row.enabled):
            row.pending_secret = new_secret
            row.pending_created_at = now
            return {"mode": "pending"}
        # brak aktywnego -> to nadal onboarding, możemy trzymać w secret+enabled=False
        row.secret = new_secret
        row.enabled = False
        row.pending_secret = None
        row.pending_created_at = None
        return {"mode": "seeded_disabled"}

    db.add(
        StaffUserMfa(
            staff_user_id=staff_user_id,
            method="totp",
            secret=new_secret,
            enabled=False,
            pending_secret=None,
            pending_created_at=None,
            created_at=now,
        )
    )
    return {"mode": "created_disabled"}


def _confirm_totp_change(db: Session, staff_user_id: int, secret: str, totp_code: str) -> None:
    """
    Confirm zmiany:
    - jeśli był pending_secret: promujemy pending -> secret, czyścimy pending
    - jeśli enabled=False i secret==secret: po prostu włączamy enabled=True
    """
    code = (totp_code or "").strip().replace(" ", "")
    if not code:
        raise AuthError("Brak kodu TOTP.")

    row = _get_mfa_row(db, staff_user_id)
    if not row:
        raise AuthError("Brak rekordu TOTP. Wykonaj begin jeszcze raz.")

    sec = (secret or "").strip()
    if not sec:
        raise AuthError("Brak secreta TOTP.")

    if not pyotp.TOTP(sec).verify(code, valid_window=1):
        raise AuthError("Nieprawidłowy kod TOTP.")

    # Jeżeli jest aktywny i mamy pending -> confirm dotyczy pending
    if bool(row.enabled) and row.pending_secret:
        if (row.pending_secret or "").strip() != sec:
            raise AuthError("Secret nie pasuje do oczekującej zmiany TOTP. Wykonaj begin jeszcze raz.")
        row.secret = row.pending_secret
        row.enabled = True
        row.pending_secret = None
        row.pending_created_at = None
        return

    # onboarding/disabled flow: confirmujemy secret w kolumnie secret
    if not bool(row.enabled):
        if (row.secret or "").strip() != sec:
            raise AuthError("Secret nie pasuje do oczekującej konfiguracji TOTP. Wykonaj begin jeszcze raz.")
        row.enabled = True
        row.pending_secret = None
        row.pending_created_at = None
        return

    # enabled=True i brak pending -> nic do potwierdzania
    raise AuthError("Brak oczekującej zmiany TOTP.")


def _verify_current_totp(db: Session, *, staff_user_id: int, totp_code: str) -> None:
    secret = _get_totp_secret(db, staff_user_id)
    if not secret:
        raise AuthError("Brak aktywnego TOTP.")
    code = (totp_code or "").strip().replace(" ", "")
    if not code:
        raise AuthError("Brak kodu TOTP.")
    if not pyotp.TOTP(secret).verify(code, valid_window=1):
        raise AuthError("Nieprawidłowy kod TOTP.")


# ============================================================
# AUTHN: LOGIN
# ============================================================

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


# ============================================================
# BOOTSTRAP (NEW, TWO-PHASE)
# ============================================================

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


# ============================================================
# SETUP MODE (must_change_credentials flow)
# ============================================================

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


# ============================================================
# SELF-SERVICE endpoints
# ============================================================

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
