from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Header, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from crm.db.session import get_db
from crm.db.models.staff import StaffUser

from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require
from crm.users.identity.jwt_deps import get_current_user

from crm.users.services.staff.staff_admin_service import (
    create_staff_user,
    reset_staff_password,
    reset_staff_totp,
    StaffAdminError,
)

from crm.users.services.staff.access_service import (
    disable_staff_user,
    enable_staff_user,
    archive_staff_user,
    unarchive_staff_user,
    StaffAccessError,
)

from crm.users.services.rbac.permission_service import (
    resolve_staff_actions,
    RbacError,
)

from crm.users.services.rbac.admin_service import (
    update_staff_permission_overrides,
    RbacAdminError,
)

router = APIRouter(prefix="/staff", tags=["staff"])


class StaffCreateIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    role: str = Field(..., min_length=2, max_length=64)


class StaffArchiveIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class StaffOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    status: str
    must_change_credentials: bool
    mfa_required: bool

    @classmethod
    def from_model(cls, u: StaffUser) -> "StaffOut":
        return cls(
            id=int(u.id),
            username=u.username,
            email=u.email,
            role=str(u.role),
            status=str(u.status),
            must_change_credentials=bool(u.must_change_credentials),
            mfa_required=bool(u.mfa_required),
        )


class StaffPermissionOut(BaseModel):
    code: str
    label_pl: str
    description_pl: str
    allowed: bool
    source: str
    override: Optional[str] = None


class StaffPermissionsUpdateIn(BaseModel):
    # { action_code: "allow" | "deny" | null }
    overrides: dict = Field(default_factory=dict)


def _get_staff_or_404(db: Session, staff_id: int) -> StaffUser:
    u = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff user not found")
    return u


# ✅ NOWE: staff widzi zawsze siebie
@router.get(
    "/self",
    response_model=StaffOut,
    dependencies=[Depends(require(Action.STAFF_READ_SELF))],
)
def staff_self(
    _request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    # _me już jest z DB, ale trzymajmy schemat
    me = db.get(StaffUser, int(_me.id)) or _me
    return StaffOut.from_model(me)


@router.get(
    "",
    response_model=List[StaffOut],
    dependencies=[Depends(require(Action.STAFF_LIST))],
)
def staff_list(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    users = db.query(StaffUser).order_by(StaffUser.id.asc()).all()
    return [StaffOut.from_model(u) for u in users]


@router.get(
    "/{staff_id}/permissions",
    response_model=List[StaffPermissionOut],
    dependencies=[Depends(require(Action.STAFF_PERMISSIONS_READ))],
)
def staff_permissions_get(
    staff_id: int,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)
    resolved = resolve_staff_actions(db, staff_user_id=int(u.id), role_code=str(u.role))
    return [
        StaffPermissionOut(
            code=a.code,
            label_pl=a.label_pl,
            description_pl=a.description_pl,
            allowed=a.allowed,
            source=a.source,
            override=a.override,
        )
        for a in resolved
    ]


@router.put(
    "/{staff_id}/permissions",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require(Action.STAFF_PERMISSIONS_WRITE))],
)
def staff_permissions_put(
    staff_id: int,
    payload: StaffPermissionsUpdateIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)
    try:
        update_staff_permission_overrides(
            db,
            actor_staff_id=int(_me.id),
            target_staff_id=int(u.id),
            overrides=dict(payload.overrides),
        )
        db.commit()
        return None
    except (RbacError, RbacAdminError) as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=StaffOut,
    dependencies=[Depends(require(Action.STAFF_CREATE))],
)
def admin_create_staff(
    payload: StaffCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    try:
        u = create_staff_user(
            db,
            actor=_me,
            username=payload.username,
            email=str(payload.email),
            role=payload.role,
        )
        return StaffOut.from_model(u)
    except StaffAdminError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/{staff_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require(Action.STAFF_RESET_PASSWORD))],
)
def admin_reset_staff_password(
    staff_id: int,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)
    reset_staff_password(db, staff_user=u, reset_by_staff_id=int(_me.id))
    return None


@router.post(
    "/{staff_id}/reset-totp",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require(Action.STAFF_RESET_TOTP))],
)
def admin_reset_staff_totp(
    staff_id: int,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)
    reset_staff_totp(db, staff_user=u, reset_by_staff_id=int(_me.id))
    return None


@router.post(
    "/{staff_id}/disable",
    response_model=dict,
    dependencies=[Depends(require(Action.STAFF_DISABLE))],
)
def admin_disable_staff(
    staff_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        res = disable_staff_user(
            db,
            actor_staff_id=int(_me.id),
            target_staff_id=int(staff_id),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return res.__dict__
    except StaffAccessError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{staff_id}/enable",
    response_model=dict,
    dependencies=[Depends(require(Action.STAFF_ENABLE))],
)
def admin_enable_staff(
    staff_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        res = enable_staff_user(
            db,
            actor_staff_id=int(_me.id),
            target_staff_id=int(staff_id),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return res.__dict__
    except StaffAccessError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{staff_id}/archive",
    response_model=dict,
    dependencies=[Depends(require(Action.STAFF_ARCHIVE))],
)
def admin_archive_staff(
    staff_id: int,
    payload: StaffArchiveIn,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        res = archive_staff_user(
            db,
            actor_staff_id=int(_me.id),
            target_staff_id=int(staff_id),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
            reason=payload.reason,
        )
        return res.__dict__
    except StaffAccessError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/{staff_id}/unarchive",
    response_model=dict,
    dependencies=[Depends(require(Action.STAFF_UNARCHIVE))],
)
def admin_unarchive_staff(
    staff_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        res = unarchive_staff_user(
            db,
            actor_staff_id=int(_me.id),
            target_staff_id=int(staff_id),
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return res.__dict__
    except StaffAccessError as e:
        raise HTTPException(status_code=400, detail=str(e))
