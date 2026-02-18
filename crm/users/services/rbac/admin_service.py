from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from sqlalchemy.orm import Session

from crm.db.models.rbac import RbacAction, RbacRole, RbacRoleAction, StaffActionOverride
from crm.db.models.staff import AuditLog
from crm.users.services.rbac.permission_service import RbacError, role_exists
from crm.shared.request_context import get_request_context


class RbacAdminError(RuntimeError):
    pass


def _audit(
    *,
    db: Session,
    actor_staff_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    before: Optional[Dict[str, Any]],
    after: Optional[Dict[str, Any]],
    meta: Optional[Dict[str, Any]] = None,
    severity: str = "critical",
) -> None:
    ctx = get_request_context()
    db.add(
        AuditLog(
            staff_user_id=int(actor_staff_id),
            severity=severity,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            request_id=ctx.request_id,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
            before=before,
            after=after,
            meta=meta,
        )
    )


def update_staff_permission_overrides(
    db: Session,
    *,
    actor_staff_id: int,
    target_staff_id: int,
    overrides: Dict[str, Optional[str]],
) -> None:
    """Update staff overrides + compliance audit (critical).

    before/after zapisujemy jako mapę {action_code: effect}, gdzie effect ∈ {"allow","deny"}.
    meta zawiera listę action_codes z payloadu.
    """

    # BEFORE
    before_map: Dict[str, str] = {
        code: effect
        for code, effect in (
            db.query(RbacAction.code, StaffActionOverride.effect)
            .join(RbacAction, StaffActionOverride.action_id == RbacAction.id)
            .filter(StaffActionOverride.staff_user_id == int(target_staff_id))
            .all()
        )
    }

    # perform update
    from crm.users.services.rbac.permission_service import set_staff_overrides

    set_staff_overrides(db, staff_user_id=int(target_staff_id), overrides=dict(overrides))

    # AFTER
    after_map: Dict[str, str] = {
        code: effect
        for code, effect in (
            db.query(RbacAction.code, StaffActionOverride.effect)
            .join(RbacAction, StaffActionOverride.action_id == RbacAction.id)
            .filter(StaffActionOverride.staff_user_id == int(target_staff_id))
            .all()
        )
    }

    _audit(
        db=db,
        actor_staff_id=int(actor_staff_id),
        action="STAFF_PERMISSIONS_PUT",
        entity_type="staff_users",
        entity_id=str(target_staff_id),
        before={"overrides": before_map},
        after={"overrides": after_map},
        meta={"action_codes": sorted(list(overrides.keys()))},
        severity="critical",
    )


def get_role_action_codes(db: Session, *, role_code: str) -> Set[str]:
    return set(
        code
        for (code,) in (
            db.query(RbacAction.code)
            .select_from(RbacRoleAction)
            .join(RbacRole, RbacRoleAction.role_id == RbacRole.id)
            .join(RbacAction, RbacRoleAction.action_id == RbacAction.id)
            .filter(RbacRole.code == role_code)
            .all()
        )
    )


def set_role_actions(
    db: Session,
    *,
    actor_staff_id: int,
    role_code: str,
    action_codes: List[str],
) -> None:
    """Replace role actions (checkbox style) + audit before/after."""

    if not role_exists(db, role_code=role_code):
        raise RbacAdminError("Nieznana rola")

    desired: Set[str] = set(action_codes)

    # validate actions exist
    existing_codes = set(
        code
        for (code,) in db.query(RbacAction.code).filter(RbacAction.code.in_(list(desired))).all()
    )
    missing = sorted(list(desired - existing_codes))
    if missing:
        raise RbacError(f"Nieznane uprawnienia: {', '.join(missing)}")

    role = db.query(RbacRole).filter(RbacRole.code == role_code).one()

    before_set = get_role_action_codes(db, role_code=role_code)

    # compute delta
    to_add = desired - before_set
    to_del = before_set - desired

    if not to_add and not to_del:
        # still audit? we'd rather avoid noise
        return

    # map action code -> id
    action_ids = {
        code: int(aid)
        for code, aid in db.query(RbacAction.code, RbacAction.id).filter(RbacAction.code.in_(list(to_add | to_del))).all()
    }

    # delete
    if to_del:
        del_ids = [action_ids[c] for c in to_del if c in action_ids]
        if del_ids:
            db.query(RbacRoleAction).filter(RbacRoleAction.role_id == int(role.id)).filter(RbacRoleAction.action_id.in_(del_ids)).delete(synchronize_session=False)

    # add
    for c in sorted(list(to_add)):
        db.add(RbacRoleAction(role_id=int(role.id), action_id=int(action_ids[c])))

    after_set = get_role_action_codes(db, role_code=role_code)

    _audit(
        db=db,
        actor_staff_id=int(actor_staff_id),
        action="RBAC_ROLE_ACTIONS_PUT",
        entity_type="rbac_roles",
        entity_id=str(role.code),
        before={"action_codes": sorted(list(before_set))},
        after={"action_codes": sorted(list(after_set))},
        meta={"added": sorted(list(to_add)), "removed": sorted(list(to_del))},
        severity="critical",
    )
