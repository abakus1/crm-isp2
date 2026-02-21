from __future__ import annotations

from datetime import date
from typing import Any, List, Optional

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
    set_staff_role,
    update_staff_profile,
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


class StaffAddressPrg(BaseModel):
    place_name: Optional[str] = None
    terc: Optional[str] = None
    simc: Optional[str] = None
    street_name: Optional[str] = None
    ulic: Optional[str] = None
    building_no: Optional[str] = None
    local_no: Optional[str] = None


class StaffCreateIn(BaseModel):
    # Docelowo: imię/nazwisko/login/email_prywatny/telefon_firmowy
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=120)
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    phone_company: Optional[str] = Field(default=None, max_length=32)


class StaffArchiveIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class StaffUpdateIn(BaseModel):
    # profil
    first_name: Optional[str] = Field(default=None, max_length=80)
    last_name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[EmailStr] = None
    phone_company: Optional[str] = Field(default=None, max_length=32)
    job_title: Optional[str] = Field(default=None, max_length=120)
    birth_date: Optional[date] = None
    pesel: Optional[str] = Field(default=None, max_length=11)
    id_document_no: Optional[str] = Field(default=None, max_length=32)

    # legacy (utrzymujemy)
    address_registered: Optional[str] = None
    address_current: Optional[str] = None

    # ✅ PRG canon
    address_registered_prg: Optional[StaffAddressPrg] = None
    address_current_prg: Optional[StaffAddressPrg] = None

    address_current_same_as_registered: Optional[bool] = None

    # bezpieczeństwo (policy: admin może wymusić/zdjąć requirement MFA)
    mfa_required: Optional[bool] = None


class StaffRoleUpdateIn(BaseModel):
    role: str = Field(..., min_length=1, max_length=64)


class StaffOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    role: str
    status: str
    must_change_credentials: bool
    mfa_required: bool

    # profile (opcjonalne)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone_company: Optional[str] = None
    job_title: Optional[str] = None
    birth_date: Optional[str] = None
    pesel: Optional[str] = None
    id_document_no: Optional[str] = None

    # legacy
    address_registered: Optional[str] = None
    address_current: Optional[str] = None
    address_current_same_as_registered: Optional[bool] = None

    # ✅ PRG canon
    address_registered_prg: Optional[StaffAddressPrg] = None
    address_current_prg: Optional[StaffAddressPrg] = None

    @classmethod
    def from_model(cls, u: StaffUser) -> "StaffOut":
        bd = getattr(u, "birth_date", None)

        reg_prg = StaffAddressPrg(
            place_name=getattr(u, "address_registered_prg_place_name", None),
            terc=getattr(u, "address_registered_prg_terc", None),
            simc=getattr(u, "address_registered_prg_simc", None),
            street_name=getattr(u, "address_registered_prg_street_name", None),
            ulic=getattr(u, "address_registered_prg_ulic", None),
            building_no=getattr(u, "address_registered_prg_building_no", None),
            local_no=getattr(u, "address_registered_prg_local_no", None),
        )

        cur_prg = StaffAddressPrg(
            place_name=getattr(u, "address_current_prg_place_name", None),
            terc=getattr(u, "address_current_prg_terc", None),
            simc=getattr(u, "address_current_prg_simc", None),
            street_name=getattr(u, "address_current_prg_street_name", None),
            ulic=getattr(u, "address_current_prg_ulic", None),
            building_no=getattr(u, "address_current_prg_building_no", None),
            local_no=getattr(u, "address_current_prg_local_no", None),
        )

        def _is_empty(x: StaffAddressPrg) -> bool:
            return not any(
                [
                    x.place_name,
                    x.terc,
                    x.simc,
                    x.street_name,
                    x.ulic,
                    x.building_no,
                    x.local_no,
                ]
            )

        return cls(
            id=int(u.id),
            username=u.username,
            email=u.email,
            role=str(u.role),
            status=str(u.status),
            must_change_credentials=bool(u.must_change_credentials),
            mfa_required=bool(u.mfa_required),

            first_name=getattr(u, "first_name", None),
            last_name=getattr(u, "last_name", None),
            phone_company=getattr(u, "phone_company", None),
            job_title=getattr(u, "job_title", None),
            birth_date=bd.isoformat() if bd else None,
            pesel=getattr(u, "pesel", None),
            id_document_no=getattr(u, "id_document_no", None),

            address_registered=getattr(u, "address_registered", None),
            address_current=getattr(u, "address_current", None),
            address_current_same_as_registered=getattr(u, "address_current_same_as_registered", None),

            address_registered_prg=None if _is_empty(reg_prg) else reg_prg,
            address_current_prg=None if _is_empty(cur_prg) else cur_prg,
        )


class StaffPermissionOut(BaseModel):
    code: str
    label_pl: str
    description_pl: str
    allowed: bool
    source: str
    override: Optional[str] = None


class StaffPermissionsUpdateIn(BaseModel):
    overrides: dict = Field(default_factory=dict)


def _get_staff_or_404(db: Session, staff_id: int) -> StaffUser:
    u = db.query(StaffUser).filter(StaffUser.id == staff_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Staff user not found")
    return u


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
    me = db.get(StaffUser, int(_me.id)) or _me
    return StaffOut.from_model(me)


@router.get(
    "/{staff_id}",
    response_model=StaffOut,
    dependencies=[Depends(require(Action.STAFF_READ))],
)
def staff_get_one(
    staff_id: int,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)
    return StaffOut.from_model(u)


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
            first_name=payload.first_name,
            last_name=payload.last_name,
            username=payload.username,
            email=str(payload.email),
            phone_company=payload.phone_company,
        )
        db.commit()
        db.refresh(u)
        return StaffOut.from_model(u)
    except StaffAdminError as e:
        db.rollback()
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


@router.put(
    "/{staff_id}",
    response_model=StaffOut,
    dependencies=[Depends(require(Action.STAFF_UPDATE))],
)
def admin_update_staff_profile(
    staff_id: int,
    payload: StaffUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)

    # self-edit przez ten endpoint blokujemy twardo (policy: pracownik nie edytuje siebie)
    if int(_me.id) == int(u.id):
        raise HTTPException(status_code=403, detail="Self-edit jest zabroniony")

    # patch tylko dla pól które przyszły (exclude_unset)
    patch: dict[str, Any] = payload.model_dump(exclude_unset=True)

    try:
        update_staff_profile(
            db,
            actor_staff_id=int(_me.id),
            target=u,
            patch=patch,
        )
        db.commit()
        db.refresh(u)
        return StaffOut.from_model(u)
    except StaffAdminError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put(
    "/{staff_id}/role",
    response_model=StaffOut,
    dependencies=[Depends(require(Action.STAFF_ROLE_SET))],
)
def admin_set_staff_role(
    staff_id: int,
    payload: StaffRoleUpdateIn,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    u = _get_staff_or_404(db, staff_id)

    if int(_me.id) == int(u.id):
        raise HTTPException(status_code=403, detail="Nie zmieniasz sobie roli 😅")

    try:
        set_staff_role(
            db,
            actor_staff_id=int(_me.id),
            target=u,
            role_code=payload.role,
        )
        db.commit()
        db.refresh(u)
        return StaffOut.from_model(u)
    except StaffAdminError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e