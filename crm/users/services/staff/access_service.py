# crm/services/staff/access_service.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy.orm import Session

from crm.db.models.staff import StaffUser, AuditLog, ActivityLog

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

class StaffAccessError(Exception):
    pass

@dataclass(frozen=True)
class StaffAccessResult:
    status: str
    staff_id: int
    username: str
    new_status: str
    token_version: int


def _count_active_admins(db: Session) -> int:
    return (
        db.query(StaffUser)
        .filter(StaffUser.role == "admin")
        .filter(StaffUser.status == "active")
        .count()
    )


def _guard_last_admin(db: Session, *, target: StaffUser, action_label: str) -> None:
    """Guardrail: nigdy nie możemy zostawić systemu bez aktywnego admina."""
    if str(target.role) != "admin":
        return

    # Interesuje nas tylko przypadek: admin aktywny → próbujemy go zbić z "active".
    if str(target.status) != "active":
        return

    if _count_active_admins(db) <= 1:
        raise StaffAccessError(
            f"Nie można wykonać akcji '{action_label}' na jedynym aktywnym administratorze. "
            "Najpierw utwórz drugiego admina i przekaż odpowiedzialność."
        )

def _log_audit(
    db: Session,
    *,
    actor_staff_id: int,
    ip: Optional[str],
    action: str,
    entity_id: str,
    before: Optional[Dict[str, Any]],
    after: Optional[Dict[str, Any]],
    request_id: Optional[str],
    user_agent: Optional[str],
    severity: str = "critical",
) -> None:
    db.add(
        AuditLog(
            staff_user_id=actor_staff_id,
            ip=ip,
            action=action,
            entity_type="staff_users",
            entity_id=entity_id,
            before=before,
            after=after,
            request_id=request_id,
            user_agent=user_agent,
            severity=severity,
        )
    )

def _log_activity(
    db: Session,
    *,
    actor_staff_id: int,
    action: str,
    message: str,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    db.add(
        ActivityLog(
            staff_user_id=actor_staff_id,
            action=action,
            message=message,
            meta=meta,
        )
    )

def disable_staff_user(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> StaffAccessResult:
    if actor_staff_id == target_staff_id:
        raise StaffAccessError("Nie możesz zablokować samego siebie.")

    user = db.get(StaffUser, target_staff_id)
    if not user:
        raise StaffAccessError("Nie znaleziono pracownika.")

    # Guardrail: nie blokuj jedynego admina
    _guard_last_admin(db, target=user, action_label="disable")

    before = {"status": str(user.status), "token_version": int(user.token_version)}

    if user.status == "disabled":
        # idempotentnie: nie robimy dramatu
        return StaffAccessResult(
            status="ok",
            staff_id=int(user.id),
            username=user.username,
            new_status=str(user.status),
            token_version=int(user.token_version),
        )

    user.status = "disabled"
    user.token_version = int(user.token_version) + 1  # kill active tokens
    user.updated_at = _utcnow()

    after = {"status": str(user.status), "token_version": int(user.token_version)}

    _log_audit(
        db,
        actor_staff_id=actor_staff_id,
        ip=ip,
        action="STAFF_DISABLE",
        entity_id=str(user.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        actor_staff_id=actor_staff_id,
        action="STAFF_DISABLE",
        message="Zablokowano pracownika (kill-switch)",
        meta={"target_staff_id": int(user.id), "target_username": user.username},
    )

    db.commit()

    return StaffAccessResult(
        status="ok",
        staff_id=int(user.id),
        username=user.username,
        new_status=str(user.status),
        token_version=int(user.token_version),
    )


def archive_staff_user(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
    reason: Optional[str] = None,
) -> StaffAccessResult:
    """Przenosi konto do archiwum (soft delete)."""
    user = db.get(StaffUser, target_staff_id)
    if not user:
        raise StaffAccessError("Nie znaleziono pracownika.")

    # Guardrail: nie archiwizuj jedynego admina
    _guard_last_admin(db, target=user, action_label="archive")

    before = {"status": str(user.status), "token_version": int(user.token_version)}

    if user.status == "archived":
        return StaffAccessResult(
            status="ok",
            staff_id=int(user.id),
            username=user.username,
            new_status=str(user.status),
            token_version=int(user.token_version),
        )

    user.status = "archived"
    user.archived_at = _utcnow()
    user.archived_reason = (reason or "").strip() or None
    user.archived_by_staff_user_id = int(actor_staff_id)
    user.token_version = int(user.token_version) + 1  # kill active tokens
    user.updated_at = _utcnow()

    after = {"status": str(user.status), "token_version": int(user.token_version)}

    _log_audit(
        db,
        actor_staff_id=actor_staff_id,
        ip=ip,
        action="STAFF_ARCHIVE",
        entity_id=str(user.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        actor_staff_id=actor_staff_id,
        action="STAFF_ARCHIVE",
        message="Przeniesiono pracownika do archiwum",
        meta={
            "target_staff_id": int(user.id),
            "target_username": user.username,
            "reason": user.archived_reason,
        },
    )

    db.commit()

    return StaffAccessResult(
        status="ok",
        staff_id=int(user.id),
        username=user.username,
        new_status=str(user.status),
        token_version=int(user.token_version),
    )


def unarchive_staff_user(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> StaffAccessResult:
    user = db.get(StaffUser, target_staff_id)
    if not user:
        raise StaffAccessError("Nie znaleziono pracownika.")

    before = {"status": str(user.status), "token_version": int(user.token_version)}

    if user.status == "active":
        return StaffAccessResult(
            status="ok",
            staff_id=int(user.id),
            username=user.username,
            new_status=str(user.status),
            token_version=int(user.token_version),
        )

    user.status = "active"
    user.archived_at = None
    user.archived_reason = None
    user.archived_by_staff_user_id = None
    user.updated_at = _utcnow()

    after = {"status": str(user.status), "token_version": int(user.token_version)}

    _log_audit(
        db,
        actor_staff_id=actor_staff_id,
        ip=ip,
        action="STAFF_UNARCHIVE",
        entity_id=str(user.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        actor_staff_id=actor_staff_id,
        action="STAFF_UNARCHIVE",
        message="Przywrócono pracownika z archiwum",
        meta={"target_staff_id": int(user.id), "target_username": user.username},
    )

    db.commit()

    return StaffAccessResult(
        status="ok",
        staff_id=int(user.id),
        username=user.username,
        new_status=str(user.status),
        token_version=int(user.token_version),
    )

def enable_staff_user(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    ip: Optional[str],
    user_agent: Optional[str],
    request_id: Optional[str],
) -> StaffAccessResult:
    user = db.get(StaffUser, target_staff_id)
    if not user:
        raise StaffAccessError("Nie znaleziono pracownika.")

    before = {"status": str(user.status), "token_version": int(user.token_version)}

    if user.status == "active":
        return StaffAccessResult(
            status="ok",
            staff_id=int(user.id),
            username=user.username,
            new_status=str(user.status),
            token_version=int(user.token_version),
        )

    user.status = "active"
    user.updated_at = _utcnow()

    # (Opcjonalnie polecam) odświeżyć token_version, żeby stare tokeny z “przed blokadą” nie wróciły:
    # user.token_version = int(user.token_version) + 1

    after = {"status": str(user.status), "token_version": int(user.token_version)}

    _log_audit(
        db,
        actor_staff_id=actor_staff_id,
        ip=ip,
        action="STAFF_ENABLE",
        entity_id=str(user.id),
        before=before,
        after=after,
        request_id=request_id,
        user_agent=user_agent,
        severity="critical",
    )
    _log_activity(
        db,
        actor_staff_id=actor_staff_id,
        action="STAFF_ENABLE",
        message="Odblokowano pracownika",
        meta={"target_staff_id": int(user.id), "target_username": user.username},
    )

    db.commit()

    return StaffAccessResult(
        status="ok",
        staff_id=int(user.id),
        username=user.username,
        new_status=str(user.status),
        token_version=int(user.token_version),
    )
