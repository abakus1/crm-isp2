# crm/services/staff/staff_admin_service.py
from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import sqlalchemy as sa

from crm.shared.request_context import get_request_context
from crm.app.config import get_settings
from crm.adapters.mail.smtp_mailer import get_mailer, MailerError
from crm.db.models.staff import StaffUser, StaffUserMfa, AuditLog, ActivityLog
from crm.users.services.rbac.permission_service import role_exists

# Reuse the same password hashing scheme as identity/auth_service.py
# (you already have CryptContext there; this keeps logic outside ORM models)
from crm.users.identity.auth_service import _pwd  # noqa: WPS450


class StaffAdminError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_temp_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _set_password(user: StaffUser, raw_password: str) -> None:
    # Avoid relying on ORM having set_password(); we hash consistently with identity layer.
    user.password_hash = _pwd.hash(raw_password)


def _audit(
    *,
    db: Session,
    staff_user_id: int,
    severity: str,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    meta: Optional[dict] = None,
) -> None:
    ctx = get_request_context()
    db.add(
        AuditLog(
            staff_user_id=staff_user_id,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
            request_id=ctx.request_id,
            severity=severity,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
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
    message: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(
        ActivityLog(
            staff_user_id=staff_user_id,
            action=action,
            message=message,
            target_type=target_type,
            target_id=target_id,
            meta=meta,
        )
    )


def create_staff_user(
    db: Session,
    *,
    actor: StaffUser,
    username: str,
    email: Optional[str],
    role: str,
    created_by_staff_id: int | None = None,
    request_id: Optional[str] = None,
    actor_ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> StaffUser:
    existing = db.query(StaffUser).filter(StaffUser.username == username).first()
    if existing:
        raise StaffAdminError("Username already exists")

    if not email:
        raise StaffAdminError("Email is required")

    email_norm = (email or "").strip().lower()
    if "@" not in email_norm:
        raise StaffAdminError("Invalid email")

    # Unikalność email w całym staff_users (admin+staff razem)
    email_exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .first()
    )
    if email_exists:
        raise StaffAdminError("Email already exists")

    # Rola/stanowisko musi istnieć w RBAC (DB)
    if not role_exists(db, role_code=role):
        raise StaffAdminError("Nieznane stanowisko/rola")

    temp_password = _generate_temp_password()
    now = _now()

    creator_id = int(created_by_staff_id) if created_by_staff_id is not None else int(actor.id)

    user = StaffUser(
        username=username,
        email=email_norm,
        role=role,
        status="active",
        must_change_credentials=True,
        mfa_required=True,
        token_version=1,
        password_changed_at=now,
        created_at=now,
        updated_at=now,
    )
    _set_password(user, temp_password)

    db.add(user)
    db.flush()  # mamy user.id bez commita

    # audit + activity w TEJ SAMEJ transakcji
    _audit(
        db=db,
        staff_user_id=int(actor.id),
        severity="info",
        action="STAFF_CREATE",
        entity_type="staff_users",
        entity_id=str(user.id),
        before=None,
        after={
            "id": int(user.id),
            "username": user.username,
            "email": user.email,
            "role": str(user.role),
            "status": str(user.status),
        },
        meta={
            "created_by_staff_id": creator_id,
            "request_id": request_id,
            "actor_ip": actor_ip,
            "user_agent": user_agent,
        },
    )
    _activity(
        db=db,
        staff_user_id=int(actor.id),
        action="STAFF_CREATE",
        message=f"Utworzono pracownika {user.username}",
        target_type="staff_users",
        target_id=str(user.id),
        meta={"username": user.username, "role": str(user.role)},
    )

    # seed MFA record (totp)
    db.add(
        StaffUserMfa(
            staff_user_id=int(user.id),
            method="totp",
            enabled=False,
            secret=None,
            pending_secret=None,
            pending_created_at=None,
            created_at=now,
        )
    )

    # mail
    settings = get_settings()
    if settings.mail_send_enabled:
        try:
            mailer = get_mailer()
            mailer.send_staff_welcome_email(
                to_email=email_norm,
                username=username,
                temp_password=temp_password,
            )
        except MailerError as e:
            # nadal commitujemy usera, ale logujemy warning
            _audit(
                db=db,
                staff_user_id=int(actor.id),
                severity="warning",
                action="STAFF_WELCOME_EMAIL_FAILED",
                entity_type="staff_users",
                entity_id=str(user.id),
                meta={"error": str(e), "to": email_norm},
            )

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise StaffAdminError("Database constraint error") from e

    return user


def reset_staff_password(db: Session, *, staff_user: StaffUser, reset_by_staff_id: int) -> None:
    temp_password = _generate_temp_password()
    now = _now()

    before = {
        "must_change_credentials": bool(staff_user.must_change_credentials),
        "token_version": int(staff_user.token_version),
    }

    staff_user.password_hash = _pwd.hash(temp_password)
    staff_user.must_change_credentials = True
    staff_user.password_changed_at = now
    staff_user.token_version = int(staff_user.token_version) + 1
    staff_user.updated_at = now

    after = {
        "must_change_credentials": bool(staff_user.must_change_credentials),
        "token_version": int(staff_user.token_version),
    }

    _audit(
        db=db,
        staff_user_id=reset_by_staff_id,
        severity="critical",
        action="STAFF_RESET_PASSWORD",
        entity_type="staff_users",
        entity_id=str(staff_user.id),
        before=before,
        after=after,
        meta={"target_username": staff_user.username},
    )

    _activity(
        db=db,
        staff_user_id=reset_by_staff_id,
        action="STAFF_RESET_PASSWORD",
        message=f"Zresetowano hasło pracownika {staff_user.username}",
        target_type="staff_users",
        target_id=str(staff_user.id),
        meta={"target_username": staff_user.username},
    )

    settings = get_settings()
    if settings.mail_send_enabled and staff_user.email:
        try:
            mailer = get_mailer()
            mailer.send_staff_password_reset_email(
                to_email=staff_user.email,
                username=staff_user.username,
                temp_password=temp_password,
            )
        except MailerError as e:
            _audit(
                db=db,
                staff_user_id=reset_by_staff_id,
                severity="warning",
                action="STAFF_PASSWORD_RESET_EMAIL_FAILED",
                entity_type="staff_users",
                entity_id=str(staff_user.id),
                meta={"error": str(e), "to": staff_user.email},
            )

    db.commit()


def reset_staff_totp(db: Session, *, staff_user: StaffUser, reset_by_staff_id: int) -> None:
    now = _now()

    mfa = (
        db.query(StaffUserMfa)
        .filter(StaffUserMfa.staff_user_id == int(staff_user.id))
        .filter(StaffUserMfa.method == "totp")
        .first()
    )
    if not mfa:
        raise StaffAdminError("TOTP record not found for staff user")

    before = {"enabled": bool(mfa.enabled)}
    mfa.enabled = False
    mfa.secret = None
    mfa.pending_secret = None
    mfa.pending_created_at = None

    staff_user.must_change_credentials = True
    staff_user.updated_at = now

    after = {"enabled": bool(mfa.enabled)}

    _audit(
        db=db,
        staff_user_id=reset_by_staff_id,
        severity="critical",
        action="STAFF_RESET_TOTP",
        entity_type="staff_users",
        entity_id=str(staff_user.id),
        before=before,
        after=after,
        meta={"target_username": staff_user.username},
    )

    _activity(
        db=db,
        staff_user_id=reset_by_staff_id,
        action="STAFF_RESET_TOTP",
        message=f"Zresetowano TOTP pracownika {staff_user.username}",
        target_type="staff_users",
        target_id=str(staff_user.id),
        meta={"target_username": staff_user.username},
    )

    db.commit()
