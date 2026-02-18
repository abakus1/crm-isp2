from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Set

import sqlalchemy as sa
from sqlalchemy.orm import Session

from crm.db.models.rbac import RbacAction, RbacRole, RbacRoleAction, StaffActionOverride


class RbacError(RuntimeError):
    pass


@dataclass(frozen=True)
class ActionResolved:
    code: str
    label_pl: str
    description_pl: str
    allowed: bool
    source: str  # role | override_allow | override_deny | none
    override: Optional[str]  # allow | deny | None


def is_action_allowed(db: Session, *, staff_user_id: int, role_code: str, action_code: str) -> bool:
    """RBAC resolution rules (no dependencies between permissions):

    1) Explicit DENY override on staff_user -> DENY
    2) Explicit ALLOW override on staff_user -> ALLOW
    3) Role grants action -> ALLOW
    4) Otherwise -> DENY
    """

    # overrides are rare, so first do a tiny lookup
    ov = (
        db.query(StaffActionOverride)
        .join(RbacAction, StaffActionOverride.action_id == RbacAction.id)
        .filter(StaffActionOverride.staff_user_id == int(staff_user_id))
        .filter(RbacAction.code == action_code)
        .one_or_none()
    )
    if ov and ov.effect == "deny":
        return False
    if ov and ov.effect == "allow":
        return True

    granted = (
        db.query(RbacRoleAction)
        .join(RbacRole, RbacRoleAction.role_id == RbacRole.id)
        .join(RbacAction, RbacRoleAction.action_id == RbacAction.id)
        .filter(RbacRole.code == role_code)
        .filter(RbacAction.code == action_code)
        .first()
    )
    return bool(granted)


def list_actions(db: Session) -> List[RbacAction]:
    return db.query(RbacAction).order_by(RbacAction.code.asc()).all()


def list_roles(db: Session) -> List[RbacRole]:
    return db.query(RbacRole).order_by(RbacRole.code.asc()).all()


def role_exists(db: Session, *, role_code: str) -> bool:
    return bool(db.query(RbacRole.id).filter(RbacRole.code == role_code).first())


def resolve_staff_actions(db: Session, *, staff_user_id: int, role_code: str) -> List[ActionResolved]:
    actions = list_actions(db)

    role_action_codes: Set[str] = set(
        r[0]
        for r in (
            db.query(RbacAction.code)
            .select_from(RbacRoleAction)
            .join(RbacRole, RbacRoleAction.role_id == RbacRole.id)
            .join(RbacAction, RbacRoleAction.action_id == RbacAction.id)
            .filter(RbacRole.code == role_code)
            .all()
        )
    )

    overrides: Dict[str, str] = {
        code: effect
        for code, effect in (
            db.query(RbacAction.code, StaffActionOverride.effect)
            .join(RbacAction, StaffActionOverride.action_id == RbacAction.id)
            .filter(StaffActionOverride.staff_user_id == int(staff_user_id))
            .all()
        )
    }

    out: List[ActionResolved] = []
    for a in actions:
        code = a.code
        ov = overrides.get(code)
        if ov == "deny":
            out.append(
                ActionResolved(
                    code=code,
                    label_pl=a.label_pl,
                    description_pl=a.description_pl,
                    allowed=False,
                    source="override_deny",
                    override="deny",
                )
            )
            continue
        if ov == "allow":
            out.append(
                ActionResolved(
                    code=code,
                    label_pl=a.label_pl,
                    description_pl=a.description_pl,
                    allowed=True,
                    source="override_allow",
                    override="allow",
                )
            )
            continue

        if code in role_action_codes:
            out.append(
                ActionResolved(
                    code=code,
                    label_pl=a.label_pl,
                    description_pl=a.description_pl,
                    allowed=True,
                    source="role",
                    override=None,
                )
            )
        else:
            out.append(
                ActionResolved(
                    code=code,
                    label_pl=a.label_pl,
                    description_pl=a.description_pl,
                    allowed=False,
                    source="none",
                    override=None,
                )
            )
    return out


def set_staff_overrides(
    db: Session,
    *,
    staff_user_id: int,
    overrides: Dict[str, Optional[str]],
) -> None:
    """Upsert overrides.

    overrides: { action_code: "allow" | "deny" | None }
    None => remove override.
    """

    # validate actions exist
    action_codes = list(overrides.keys())
    existing = {
        code: action_id
        for code, action_id in (
            db.query(RbacAction.code, RbacAction.id)
            .filter(RbacAction.code.in_(action_codes))
            .all()
        )
    }
    missing = [c for c in action_codes if c not in existing]
    if missing:
        raise RbacError(f"Nieznane uprawnienia: {', '.join(missing)}")

    # current overrides
    cur = {
        code: (ov_id, effect)
        for code, ov_id, effect in (
            db.query(RbacAction.code, StaffActionOverride.id, StaffActionOverride.effect)
            .join(RbacAction, StaffActionOverride.action_id == RbacAction.id)
            .filter(StaffActionOverride.staff_user_id == int(staff_user_id))
            .all()
        )
    }

    for code, effect in overrides.items():
        if effect not in ("allow", "deny", None):
            raise RbacError(f"Zły efekt override dla {code}: {effect}")

        if effect is None:
            if code in cur:
                ov_id, _ = cur[code]
                db.query(StaffActionOverride).filter(StaffActionOverride.id == ov_id).delete()
            continue

        action_id = int(existing[code])
        if code in cur:
            ov_id, _old = cur[code]
            db.query(StaffActionOverride).filter(StaffActionOverride.id == ov_id).update({"effect": effect})
        else:
            db.add(
                StaffActionOverride(
                    staff_user_id=int(staff_user_id),
                    action_id=action_id,
                    effect=effect,
                )
            )
