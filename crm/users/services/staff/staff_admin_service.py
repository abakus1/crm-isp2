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


def _prg_norm_code(v: Any, *, max_len: int) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    # PRG/TERYT są zwykle numeryczne, ale nie ryzykujemy "int()" (leading zeros)
    if len(s) > max_len:
        raise StaffAdminError("Nieprawidłowa długość kodu PRG/TERYT")
    return s


def _prg_norm_text(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _apply_prg_address_patch(
    *,
    target: StaffUser,
    field_prefix: str,  # "address_registered" albo "address_current"
    prg: Optional[dict],
) -> None:
    """Mapuje address_*_prg (dict) na kolumny modelu StaffUser."""
    if prg is None:
        return

    # Akceptujemy dokładnie te klucze (resztę olewamy, bo Pydantic i tak filtruje,
    # ale patch może przyjść z .model_dump() w różnej formie).
    place_name = _prg_norm_text(prg.get("place_name"))
    terc = _prg_norm_code(prg.get("terc"), max_len=8)
    simc = _prg_norm_code(prg.get("simc"), max_len=8)
    street_name = _prg_norm_text(prg.get("street_name"))
    ulic = _prg_norm_code(prg.get("ulic"), max_len=8)
    building_no = _prg_norm_code(prg.get("building_no"), max_len=32)
    local_no = _prg_norm_code(prg.get("local_no"), max_len=32)

    postal_code = _prg_norm_code(prg.get("postal_code"), max_len=16)
    post_city = _prg_norm_text(prg.get("post_city"))

    setattr(target, f"{field_prefix}_prg_place_name", place_name)
    setattr(target, f"{field_prefix}_prg_terc", terc)
    setattr(target, f"{field_prefix}_prg_simc", simc)
    setattr(target, f"{field_prefix}_prg_street_name", street_name)
    setattr(target, f"{field_prefix}_prg_ulic", ulic)
    setattr(target, f"{field_prefix}_prg_building_no", building_no)
    setattr(target, f"{field_prefix}_prg_local_no", local_no)

    setattr(target, f"{field_prefix}_postal_code", postal_code)
    setattr(target, f"{field_prefix}_post_city", post_city)


def _format_legacy_address_from_prg(prg: dict) -> Optional[str]:
    """Skleja człowieczy adres (legacy string) z PRG pól.
    To jest “best effort” – nie jest źródłem prawdy, ale UI/eksporty mogą to lubić.
    """
    if not prg:
        return None

    place = _prg_norm_text(prg.get("place_name"))
    street = _prg_norm_text(prg.get("street_name"))
    building = _prg_norm_text(prg.get("building_no"))
    local = _prg_norm_text(prg.get("local_no"))
    postal_code = _prg_norm_text(prg.get("postal_code"))
    post_city = _prg_norm_text(prg.get("post_city"))

    parts = []
    if place:
        parts.append(place)

    street_part = None
    if street and building:
        street_part = f"{street} {building}"
    elif street:
        street_part = street
    elif building:
        street_part = building

    if street_part:
        parts.append(street_part)

    if local:
        parts.append(f"lok. {local}")

    # Poczta bywa inna niż miejscowość — trzymamy to jawnie
    pc = " ".join([x for x in [postal_code, post_city] if x]).strip()
    if pc:
        parts.append(pc)

    s = ", ".join(parts).strip()
    return s or None


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
    audit_action: str = "STAFF_UPDATE",
    activity_action: str = "STAFF_UPDATE",
    activity_message: Optional[str] = None,
) -> StaffUser:
    """Aktualizacja profilu pracownika.

    Domyślnie używana w ścieżkach adminowych (actor edytuje target).
    Może być użyta także do self-edit, jeśli API/policy na to pozwoli
    (wtedy ustaw audit_action/activity_action na wariant SELF).

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
        "address_registered_prg",
        "address_current_prg",
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

        # PRG snapshot (dla audytu)
        "address_registered_prg": {
            "place_name": getattr(target, "address_registered_prg_place_name", None),
            "terc": getattr(target, "address_registered_prg_terc", None),
            "simc": getattr(target, "address_registered_prg_simc", None),
            "street_name": getattr(target, "address_registered_prg_street_name", None),
            "ulic": getattr(target, "address_registered_prg_ulic", None),
            "building_no": getattr(target, "address_registered_prg_building_no", None),
            "local_no": getattr(target, "address_registered_prg_local_no", None),
            "postal_code": getattr(target, "address_registered_postal_code", None),
            "post_city": getattr(target, "address_registered_post_city", None),
        },
        "address_current_prg": {
            "place_name": getattr(target, "address_current_prg_place_name", None),
            "terc": getattr(target, "address_current_prg_terc", None),
            "simc": getattr(target, "address_current_prg_simc", None),
            "street_name": getattr(target, "address_current_prg_street_name", None),
            "ulic": getattr(target, "address_current_prg_ulic", None),
            "building_no": getattr(target, "address_current_prg_building_no", None),
            "local_no": getattr(target, "address_current_prg_local_no", None),
            "postal_code": getattr(target, "address_current_postal_code", None),
            "post_city": getattr(target, "address_current_post_city", None),
        },
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

    # --- PRG address patch (canonical) ---
    reg_prg = patch.get("address_registered_prg", None)
    cur_prg = patch.get("address_current_prg", None)

    # Pydantic daje nam BaseModel -> po drodze może zostać dict, ale czasem jest obiektem:
    if reg_prg is not None and not isinstance(reg_prg, dict):
        reg_prg = dict(reg_prg)
    if cur_prg is not None and not isinstance(cur_prg, dict):
        cur_prg = dict(cur_prg)

    if reg_prg is not None:
        _apply_prg_address_patch(target=target, field_prefix="address_registered", prg=reg_prg)
        # best effort: utrzymuj legacy string jeśli admin nie podał własnego
        if "address_registered" not in patch:
            patch["address_registered"] = _format_legacy_address_from_prg(reg_prg)

    if cur_prg is not None:
        _apply_prg_address_patch(target=target, field_prefix="address_current", prg=cur_prg)
        if "address_current" not in patch:
            patch["address_current"] = _format_legacy_address_from_prg(cur_prg)

    # honoruj "same as registered" (jeśli przyszło true)
    # - jeśli admin ustawia True, to current adres (PRG + legacy) kopiuje się z registered
    # - jeśli admin ustawia False, nic nie kopiujemy (zostaje to co podał / było w DB)
    if patch.get("address_current_same_as_registered") is True:
        # legacy
        patch["address_current"] = patch.get("address_registered", target.address_registered)

        # PRG: kopiujemy wartości z registered -> current
        setattr(target, "address_current_prg_place_name", getattr(target, "address_registered_prg_place_name", None))
        setattr(target, "address_current_prg_terc", getattr(target, "address_registered_prg_terc", None))
        setattr(target, "address_current_prg_simc", getattr(target, "address_registered_prg_simc", None))
        setattr(target, "address_current_prg_street_name", getattr(target, "address_registered_prg_street_name", None))
        setattr(target, "address_current_prg_ulic", getattr(target, "address_registered_prg_ulic", None))
        setattr(target, "address_current_prg_building_no", getattr(target, "address_registered_prg_building_no", None))
        setattr(target, "address_current_prg_local_no", getattr(target, "address_registered_prg_local_no", None))

        # Poczta
        setattr(target, "address_current_postal_code", getattr(target, "address_registered_postal_code", None))
        setattr(target, "address_current_post_city", getattr(target, "address_registered_post_city", None))

    # PRG dict-y nie są polami modelu -> usuwamy z patch zanim zrobimy setattr loop
    patch.pop("address_registered_prg", None)
    patch.pop("address_current_prg", None)

    # apply zwykłych pól
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

        "address_registered_prg": {
            "place_name": getattr(target, "address_registered_prg_place_name", None),
            "terc": getattr(target, "address_registered_prg_terc", None),
            "simc": getattr(target, "address_registered_prg_simc", None),
            "street_name": getattr(target, "address_registered_prg_street_name", None),
            "ulic": getattr(target, "address_registered_prg_ulic", None),
            "building_no": getattr(target, "address_registered_prg_building_no", None),
            "local_no": getattr(target, "address_registered_prg_local_no", None),
            "postal_code": getattr(target, "address_registered_postal_code", None),
            "post_city": getattr(target, "address_registered_post_city", None),
        },
        "address_current_prg": {
            "place_name": getattr(target, "address_current_prg_place_name", None),
            "terc": getattr(target, "address_current_prg_terc", None),
            "simc": getattr(target, "address_current_prg_simc", None),
            "street_name": getattr(target, "address_current_prg_street_name", None),
            "ulic": getattr(target, "address_current_prg_ulic", None),
            "building_no": getattr(target, "address_current_prg_building_no", None),
            "local_no": getattr(target, "address_current_prg_local_no", None),
            "postal_code": getattr(target, "address_current_postal_code", None),
            "post_city": getattr(target, "address_current_post_city", None),
        },
    }

    _audit(
        db=db,
        staff_user_id=int(actor_staff_id),
        severity="info",
        action=str(audit_action),
        entity_type="staff_users",
        entity_id=str(target.id),
        before=before,
        after=after,
        meta={"fields": sorted(list(patch.keys()))},
    )
    _activity(
        db=db,
        staff_user_id=int(actor_staff_id),
        action=str(activity_action),
        message=(activity_message or f"Zaktualizowano dane pracownika {target.username}"),
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