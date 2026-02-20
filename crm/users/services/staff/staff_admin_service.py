# crm/users/services/staff/staff_admin_service.py
from __future__ import annotations

import secrets
import string
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.adapters.mail.smtp_mailer import MailerError, get_mailer
from crm.db.models.staff import ActivityLog, AuditLog, StaffUser, StaffUserMfa
from crm.shared.request_context import get_request_context
from crm.users.identity.auth_service import _pwd  # noqa: WPS450
from crm.users.services.rbac.permission_service import role_exists


class StaffAdminError(RuntimeError):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _generate_temp_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


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
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(
        ActivityLog(
            staff_user_id=staff_user_id,
            action=action,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
            meta=meta,
        )
    )


def _send_invite_best_effort(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    to_email: str,
    username: str,
    temp_password: str,
) -> None:
    settings = get_settings()
    mailer = get_mailer(settings)
    if mailer is None:
        return

    try:
        mailer.send_staff_invite(
            to_email=to_email,
            username=username,
            temp_password=temp_password,
        )
    except (MailerError, Exception) as e:
        _audit(
            db=db,
            staff_user_id=actor_staff_id,
            severity="warning",
            action="STAFF_INVITE_EMAIL_FAILED",
            entity_type="staff_users",
            entity_id=str(target_staff_id),
            meta={"error": str(e), "to": to_email},
        )


def _send_reset_password_best_effort(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    to_email: str,
    username: str,
    temp_password: str,
) -> None:
    settings = get_settings()
    mailer = get_mailer(settings)
    if mailer is None:
        return

    try:
        mailer.send_staff_reset_password(
            to_email=to_email,
            username=username,
            temp_password=temp_password,
        )
    except (MailerError, Exception) as e:
        _audit(
            db=db,
            staff_user_id=actor_staff_id,
            severity="warning",
            action="STAFF_PASSWORD_RESET_EMAIL_FAILED",
            entity_type="staff_users",
            entity_id=str(target_staff_id),
            meta={"error": str(e), "to": to_email},
        )


def _send_reset_totp_best_effort(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    to_email: str,
    username: str,
) -> None:
    settings = get_settings()
    mailer = get_mailer(settings)
    if mailer is None:
        return

    try:
        mailer.send_staff_reset_totp(
            to_email=to_email,
            username=username,
        )
    except (MailerError, Exception) as e:
        _audit(
            db=db,
            staff_user_id=actor_staff_id,
            severity="warning",
            action="STAFF_TOTP_RESET_EMAIL_FAILED",
            entity_type="staff_users",
            entity_id=str(target_staff_id),
            meta={"error": str(e), "to": to_email},
        )


def create_staff_user(
    db: Session,
    *,
    actor: StaffUser,
    first_name: str,
    last_name: str,
    username: str,
    email: Optional[str],
    phone_company: Optional[str] = None,
) -> StaffUser:
    if db.query(StaffUser).filter(StaffUser.username == username).first():
        raise StaffAdminError("Username already exists")

    if not email:
        raise StaffAdminError("Email is required")

    email_norm = (email or "").strip().lower()
    if "@" not in email_norm:
        raise StaffAdminError("Invalid email")

    email_exists = (
        db.query(StaffUser)
        .filter(StaffUser.email.isnot(None))
        .filter(sa.func.lower(StaffUser.email) == email_norm)
        .first()
    )
    if email_exists:
        raise StaffAdminError("Email already exists")

    role = "unassigned"
    if not role_exists(db, role_code=role):
        raise StaffAdminError("Brak roli startowej 'unassigned' w RBAC")

    temp_password = _generate_temp_password()
    now = _now()

    u = StaffUser(
        first_name=(first_name or "").strip() or None,
        last_name=(last_name or "").strip() or None,
        username=username,
        email=email_norm,
        phone_company=(phone_company or "").strip() or None,
        role=role,
        status="active",
        must_change_credentials=True,
        mfa_required=True,
        token_version=1,
        password_hash=_pwd.hash(temp_password),
        password_changed_at=now,
        created_at=now,
        updated_at=now,
    )

    db.add(u)
    db.flush()

    _audit(
        db=db,
        staff_user_id=int(actor.id),
        severity="info",
        action="STAFF_CREATE",
        entity_type="staff_users",
        entity_id=str(u.id),
        after={
            "id": int(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "username": u.username,
            "email": u.email,
            "phone_company": u.phone_company,
            "role": str(u.role),
            "status": str(u.status),
        },
    )
    _activity(
        db=db,
        staff_user_id=int(actor.id),
        action="STAFF_CREATE",
        message=f"Utworzono pracownika {u.username}",
        entity_type="staff_users",
        entity_id=str(u.id),
    )

    # ✅ Przywracamy to co działało: mail z hasłem tymczasowym (invite)
    _send_invite_best_effort(
        db,
        actor_staff_id=int(actor.id),
        target_staff_id=int(u.id),
        to_email=email_norm,
        username=username,
        temp_password=temp_password,
    )

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise StaffAdminError("Database constraint error") from e

    return u


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
    )
    _activity(
        db=db,
        staff_user_id=reset_by_staff_id,
        action="STAFF_RESET_PASSWORD",
        message=f"Zresetowano hasło pracownika {staff_user.username}",
        entity_type="staff_users",
        entity_id=str(staff_user.id),
    )

    if staff_user.email:
        _send_reset_password_best_effort(
            db,
            actor_staff_id=reset_by_staff_id,
            target_staff_id=int(staff_user.id),
            to_email=staff_user.email,
            username=staff_user.username,
            temp_password=temp_password,
        )

    db.commit()


def reset_staff_totp(db: Session, *, staff_user: StaffUser, reset_by_staff_id: int) -> None:
    now = _now()

    mfa = (
        db.query(StaffUserMfa)
        .filter(StaffUserMfa.staff_user_id == int(staff_user.id))
        .filter(StaffUserMfa.method == "totp")
        .order_by(StaffUserMfa.id.desc())
        .first()
    )

    before = {"mfa_row_exists": bool(mfa), "enabled": bool(getattr(mfa, "enabled", False))}

    if mfa:
        # secret NOT NULL -> nie ruszamy secreta, tylko wyłączamy
        mfa.enabled = False
        mfa.pending_secret = None
        mfa.pending_created_at = None

    staff_user.must_change_credentials = True
    staff_user.token_version = int(staff_user.token_version) + 1
    staff_user.updated_at = now

    after = {"mfa_row_exists": bool(mfa), "enabled": bool(getattr(mfa, "enabled", False))}

    _audit(
        db=db,
        staff_user_id=reset_by_staff_id,
        severity="critical",
        action="STAFF_RESET_TOTP",
        entity_type="staff_users",
        entity_id=str(staff_user.id),
        before=before,
        after=after,
    )
    _activity(
        db=db,
        staff_user_id=reset_by_staff_id,
        action="STAFF_RESET_TOTP",
        message=f"Zresetowano TOTP pracownika {staff_user.username}",
        entity_type="staff_users",
        entity_id=str(staff_user.id),
    )

    if staff_user.email:
        _send_reset_totp_best_effort(
            db,
            actor_staff_id=reset_by_staff_id,
            target_staff_id=int(staff_user.id),
            to_email=staff_user.email,
            username=staff_user.username,
        )

    db.commit()


def update_staff_profile(
    db: Session,
    *,
    actor_staff_id: int,
    target: StaffUser,
    patch: Dict[str, Any],
) -> StaffUser:
    """Admin/uprawniony: aktualizacja profilu pracownika.

    Zasada: pracownik NIE edytuje sam siebie (to jest endpoint admin-only).
    Patch jest walidowany na poziomie API (Pydantic).
    """

    allowed_fields = {
        "first_name",
        "last_name",
        "email",
        "phone_company",
        "job_title",
        "birth_date",
        "pesel",
        "id_document_no",
        "address_registered",
        "address_current",
        "address_current_same_as_registered",
        "mfa_required",
    }

    unknown = sorted([k for k in patch.keys() if k not in allowed_fields])
    if unknown:
        raise StaffAdminError(f"Nieobsługiwane pola: {', '.join(unknown)}")

    before = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "email": target.email,
        "phone_company": target.phone_company,
        "job_title": target.job_title,
        "birth_date": target.birth_date.isoformat() if target.birth_date else None,
        "pesel": target.pesel,
        "id_document_no": target.id_document_no,
        "address_registered": target.address_registered,
        "address_current": target.address_current,
        "address_current_same_as_registered": bool(target.address_current_same_as_registered),
        "mfa_required": bool(target.mfa_required),
    }

    # email uniqueness (case-insensitive)
    if "email" in patch:
        new_email = (patch.get("email") or "").strip().lower() or None
        if new_email is not None:
            if "@" not in new_email:
                raise StaffAdminError("Invalid email")

            email_exists = (
                db.query(StaffUser)
                .filter(StaffUser.id != int(target.id))
                .filter(StaffUser.email.isnot(None))
                .filter(sa.func.lower(StaffUser.email) == new_email)
                .first()
            )
            if email_exists:
                raise StaffAdminError("Email already exists")

        patch["email"] = new_email

    # normalize strings
    for key in [
        "first_name",
        "last_name",
        "phone_company",
        "job_title",
        "pesel",
        "id_document_no",
        "address_registered",
        "address_current",
    ]:
        if key in patch:
            val = patch.get(key)
            if val is None:
                continue
            s = str(val).strip()
            patch[key] = s or None

    # birth_date: accept date instance or iso str (api already parses to date)
    if "birth_date" in patch and patch["birth_date"] is not None:
        bd = patch["birth_date"]
        if isinstance(bd, str):
            try:
                patch["birth_date"] = date.fromisoformat(bd)
            except ValueError as e:
                raise StaffAdminError("Invalid birth_date") from e

    # apply
    for k, v in patch.items():
        setattr(target, k, v)

    target.updated_at = _now()

    after = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "email": target.email,
        "phone_company": target.phone_company,
        "job_title": target.job_title,
        "birth_date": target.birth_date.isoformat() if target.birth_date else None,
        "pesel": target.pesel,
        "id_document_no": target.id_document_no,
        "address_registered": target.address_registered,
        "address_current": target.address_current,
        "address_current_same_as_registered": bool(target.address_current_same_as_registered),
        "mfa_required": bool(target.mfa_required),
    }

    _audit(
        db=db,
        staff_user_id=int(actor_staff_id),
        severity="info",
        action="STAFF_UPDATE",
        entity_type="staff_users",
        entity_id=str(target.id),
        before=before,
        after=after,
        meta={"fields": sorted(list(patch.keys()))},
    )
    _activity(
        db=db,
        staff_user_id=int(actor_staff_id),
        action="STAFF_UPDATE",
        message=f"Zaktualizowano dane pracownika {target.username}",
        entity_type="staff_users",
        entity_id=str(target.id),
    )

    db.flush()
    return target


def set_staff_role(
    db: Session,
    *,
    actor_staff_id: int,
    target: StaffUser,
    role_code: str,
) -> StaffUser:
    role_code = (role_code or "").strip()
    if not role_code:
        raise StaffAdminError("Role is required")

    if not role_exists(db, role_code=role_code):
        raise StaffAdminError("Nieznana rola")

    if str(target.role) == role_code:
        return target

    before = {
        "role": str(target.role),
        "token_version": int(target.token_version),
    }

    target.role = role_code
    # wymuś relogin żeby nowe uprawnienia zadziałały natychmiast
    target.token_version = int(target.token_version) + 1
    target.updated_at = _now()

    after = {
        "role": str(target.role),
        "token_version": int(target.token_version),
    }

    _audit(
        db=db,
        staff_user_id=int(actor_staff_id),
        severity="critical",
        action="STAFF_ROLE_SET",
        entity_type="staff_users",
        entity_id=str(target.id),
        before=before,
        after=after,
        meta={"role": role_code},
    )
    _activity(
        db=db,
        staff_user_id=int(actor_staff_id),
        action="STAFF_ROLE_SET",
        message=f"Zmieniono rolę pracownika {target.username} na {role_code}",
        entity_type="staff_users",
        entity_id=str(target.id),
        meta={"role": role_code},
    )

    db.flush()
    return target