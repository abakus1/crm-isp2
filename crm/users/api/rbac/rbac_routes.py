from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require
from crm.users.identity.jwt_deps import get_current_user
from crm.users.services.rbac.permission_service import list_actions, list_roles, resolve_staff_actions
from crm.users.services.rbac.admin_service import (
    get_role_action_codes,
    set_role_actions,
    RbacAdminError,
)


router = APIRouter(prefix="/rbac", tags=["rbac"])


class RbacActionOut(BaseModel):
    code: str
    label_pl: str
    description_pl: str


class RbacRoleOut(BaseModel):
    code: str
    label_pl: str
    description_pl: str


class RbacRoleActionRow(BaseModel):
    code: str
    label_pl: str
    description_pl: str
    allowed: bool


class RbacRoleActionsPutIn(BaseModel):
    action_codes: List[str]


class RbacMeActionsOut(BaseModel):
    role: str
    action_codes: List[str]


@router.get(
    "/actions",
    response_model=List[RbacActionOut],
    dependencies=[Depends(require(Action.RBAC_ACTIONS_LIST))],
)
def rbac_actions_list(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    return [
        RbacActionOut(code=a.code, label_pl=a.label_pl, description_pl=a.description_pl)
        for a in list_actions(db)
    ]


@router.get(
    "/roles",
    response_model=List[RbacRoleOut],
    dependencies=[Depends(require(Action.RBAC_ROLES_LIST))],
)
def rbac_roles_list(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    return [
        RbacRoleOut(code=r.code, label_pl=r.label_pl, description_pl=r.description_pl)
        for r in list_roles(db)
    ]


@router.get(
    "/roles/{role_code}/actions",
    response_model=List[RbacRoleActionRow],
    dependencies=[Depends(require(Action.RBAC_ROLE_ACTIONS_READ))],
)
def rbac_role_actions_get(
    role_code: str,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    granted = get_role_action_codes(db, role_code=role_code)
    return [
        RbacRoleActionRow(
            code=a.code,
            label_pl=a.label_pl,
            description_pl=a.description_pl,
            allowed=(a.code in granted),
        )
        for a in list_actions(db)
    ]


@router.put(
    "/roles/{role_code}/actions",
    status_code=204,
    dependencies=[Depends(require(Action.RBAC_ROLE_ACTIONS_WRITE))],
)
def rbac_role_actions_put(
    role_code: str,
    payload: RbacRoleActionsPutIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    try:
        set_role_actions(
            db,
            actor_staff_id=int(_me.id),
            role_code=str(role_code),
            action_codes=list(payload.action_codes),
        )
        db.commit()
        return None
    except (RbacAdminError, Exception) as e:
        db.rollback()
        # RbacError is RuntimeError subclass; show as 400
        from crm.users.services.rbac.permission_service import RbacError

        if isinstance(e, (RbacAdminError, RbacError)):
            from fastapi import HTTPException

            raise HTTPException(status_code=400, detail=str(e))
        raise


@router.get(
    "/me/actions",
    response_model=RbacMeActionsOut,
)
def rbac_me_actions(
    db: Session = Depends(get_db),
    me: StaffUser = Depends(get_current_user),
):
    """Return effective permissions for currently logged-in user.

    Used by UI to show/hide menu elements.
    """

    resolved = resolve_staff_actions(db, staff_user_id=int(me.id), role_code=str(me.role))
    allowed = sorted([a.code for a in resolved if a.allowed])
    return RbacMeActionsOut(role=str(me.role), action_codes=allowed)
