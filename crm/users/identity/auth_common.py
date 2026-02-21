# crm/users/identity/auth_common.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import pyotp
from jose import jwt
from passlib.context import CryptContext
from passlib.exc import UnknownHashError
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.shared.request_context import get_request_context
from crm.db.models.staff import ActivityLog, AuditLog, StaffUser, StaffUserMfa, SystemBootstrapState


settings = get_settings()


_pwd = CryptContext(
    schemes=["argon2", "bcrypt"],
    deprecated="auto",
)


class AuthError(RuntimeError):
    pass


# ============================================================
# TIME / HELPERS
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

    # Always attach request context to meta for UI activity viewer (IP / UA / request_id)
    ctx = get_request_context()
    meta_out: Dict[str, Any] = dict(meta or {})
    if ctx.ip and meta_out.get("ip") is None:
        meta_out["ip"] = ctx.ip
    if ctx.user_agent and meta_out.get("user_agent") is None:
        meta_out["user_agent"] = ctx.user_agent
    if ctx.request_id and meta_out.get("request_id") is None:
        meta_out["request_id"] = ctx.request_id
    db.add(
        ActivityLog(
            occurred_at=now,
            staff_user_id=staff_user_id,
            action=action,
            entity_type=target_type,
            entity_id=target_id,
            message=message,
            meta=meta_out or None,
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
    """Aktywny secret tylko gdy enabled=True."""
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