# crm/api/identity/routes.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from crm.db.models.staff import StaffUser
from crm.db.session import get_db
from crm.users.identity.rbac import Action, require
from crm.users.identity.auth_service import (
    AuthError,
    authenticate_login,
    bootstrap_begin,
    bootstrap_complete,
    bootstrap_confirm,
    bootstrap_confirm_totp,
    self_change_password,
    self_totp_reset_begin,
    self_totp_reset_confirm,
    self_update_email,
    setup_change_password,
    setup_enable_totp,
    setup_totp_begin,
)
from crm.users.identity.jwt_deps import (
    TokenClaims,
    get_claims,
    get_current_user,
    require_bootstrap_token,
)

router = APIRouter(prefix="/identity", tags=["identity"])


# -----------------------
# LOGIN
# -----------------------
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    totp_code: Optional[str] = Field(default=None, min_length=4, max_length=16)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    staff_id: int
    username: str
    role: str
    bootstrap_mode: bool
    setup_mode: bool
    must_change_credentials: bool
    mfa_required: bool


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        res = authenticate_login(
            db,
            username=payload.username,
            password=payload.password,
            totp_code=payload.totp_code,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return LoginResponse(**res.__dict__)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


# -----------------------
# BOOTSTRAP (BEGIN)
# /identity/bootstrap
# -----------------------
class BootstrapBeginRequest(BaseModel):
    label_username: Optional[str] = Field(default=None, min_length=1, max_length=64)
    totp_secret: Optional[str] = Field(default=None, min_length=16, max_length=64)


class BootstrapResponse(BaseModel):
    status: str
    admin_id: int
    admin_username: str
    totp_secret: str
    totp_uri: str
    bootstrap_required: bool
    completed_at: Optional[str] = None
    next: Optional[str] = None


class BootstrapPrepareRequest(BaseModel):
    new_username: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    new_password: str = Field(..., min_length=8, max_length=256)
    new_password_repeat: str = Field(..., min_length=8, max_length=256)
    totp_secret: Optional[str] = Field(default=None, min_length=16, max_length=64)


@router.post("/bootstrap", response_model=BootstrapResponse)
def bootstrap(
    request: Request,
    claims: TokenClaims = Depends(require_bootstrap_token),
    db: Session = Depends(get_db),
    payload: Optional[BootstrapBeginRequest] = None,
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = bootstrap_begin(
            db,
            actor_staff_id=int(claims.sub),
            label_username=(payload.label_username if payload else None),
            totp_secret=(payload.totp_secret if payload else None),
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return BootstrapResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# LEGACY: bootstrap_complete (A) — zostawiamy dla kompatybilności ze starym UI
@router.post("/bootstrap/prepare", response_model=BootstrapResponse)
def bootstrap_prepare(
    payload: BootstrapPrepareRequest,
    request: Request,
    claims: TokenClaims = Depends(require_bootstrap_token),
    db: Session = Depends(get_db),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = bootstrap_complete(
            db,
            actor_staff_id=int(claims.sub),
            new_username=payload.new_username,
            email=payload.email,
            new_password=payload.new_password,
            new_password_repeat=payload.new_password_repeat,
            totp_secret=payload.totp_secret,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return BootstrapResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -----------------------
# BOOTSTRAP (CONFIRM)
# /identity/bootstrap/confirm
# -----------------------
class BootstrapConfirmRequest(BaseModel):
    new_username: str = Field(..., min_length=1, max_length=64)
    email: str = Field(..., min_length=3, max_length=255)
    new_password: str = Field(..., min_length=8, max_length=256)
    new_password_repeat: str = Field(..., min_length=8, max_length=256)
    totp_code: str = Field(..., min_length=4, max_length=16)


class BootstrapTotpConfirmRequest(BaseModel):
    totp_code: str = Field(..., min_length=4, max_length=16)


class BootstrapTotpConfirmResponse(BaseModel):
    status: str
    bootstrap_required: bool
    relogin_required: bool
    message: Optional[str] = None


@router.post("/bootstrap/confirm", response_model=BootstrapTotpConfirmResponse)
def bootstrap_confirm_endpoint(
    payload: BootstrapConfirmRequest,
    request: Request,
    claims: TokenClaims = Depends(require_bootstrap_token),
    db: Session = Depends(get_db),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = bootstrap_confirm(
            db,
            actor_staff_id=int(claims.sub),
            totp_code=payload.totp_code,
            new_username=payload.new_username,
            email=payload.email,
            new_password=payload.new_password,
            new_password_repeat=payload.new_password_repeat,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return BootstrapTotpConfirmResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# LEGACY: stary flow /bootstrap/totp/confirm
@router.post("/bootstrap/totp/confirm", response_model=BootstrapTotpConfirmResponse)
def bootstrap_totp_confirm_legacy(
    payload: BootstrapTotpConfirmRequest,
    request: Request,
    claims: TokenClaims = Depends(require_bootstrap_token),
    db: Session = Depends(get_db),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = bootstrap_confirm_totp(
            db,
            actor_staff_id=int(claims.sub),
            totp_code=payload.totp_code,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return BootstrapTotpConfirmResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -----------------------
# SETUP: CHANGE PASSWORD
# -----------------------
class SetupPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=256)
    new_password_repeat: str = Field(..., min_length=8, max_length=256)


class SetupPasswordResponse(BaseModel):
    status: str
    relogin_required: bool


@router.post("/setup/password", response_model=SetupPasswordResponse)
def setup_password(
    payload: SetupPasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(get_current_user),
    claims: TokenClaims = Depends(get_claims),
    x_request_id: Optional[str] = Header(default=None),
):
    if not bool(getattr(claims, "setup_mode", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie jesteś w trybie setup.")

    try:
        out = setup_change_password(
            db,
            actor=user,
            new_password=payload.new_password,
            new_password_repeat=payload.new_password_repeat,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SetupPasswordResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -----------------------
# SETUP: BEGIN TOTP (UI helper)
# -----------------------
class SetupTotpBeginRequest(BaseModel):
    totp_secret: Optional[str] = Field(default=None, min_length=16, max_length=64)


class SetupTotpBeginResponse(BaseModel):
    totp_secret: str
    totp_uri: str


@router.post("/setup/totp/begin", response_model=SetupTotpBeginResponse)
def setup_totp_begin_endpoint(
    request: Request,
    payload: Optional[SetupTotpBeginRequest] = None,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(get_current_user),
    claims: TokenClaims = Depends(get_claims),
    x_request_id: Optional[str] = Header(default=None),
):
    if not bool(getattr(claims, "setup_mode", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie jesteś w trybie setup.")

    try:
        out = setup_totp_begin(
            db,
            actor=user,
            label_username=user.username,
            totp_secret=(payload.totp_secret if payload else None),
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SetupTotpBeginResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# -----------------------
# SETUP: CONFIRM/ENABLE TOTP
# -----------------------
class SetupTotpRequest(BaseModel):
    totp_code: str = Field(..., min_length=4, max_length=16)
    totp_secret: str = Field(..., min_length=16, max_length=64)


class SetupTotpResponse(BaseModel):
    status: str
    relogin_required: bool


@router.post("/setup/totp", response_model=SetupTotpResponse)
def setup_totp(
    payload: SetupTotpRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(get_current_user),
    claims: TokenClaims = Depends(get_claims),
    x_request_id: Optional[str] = Header(default=None),
):
    if not bool(getattr(claims, "setup_mode", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Nie jesteś w trybie setup.")

    try:
        out = setup_enable_totp(
            db,
            actor=user,
            totp_code=payload.totp_code,
            secret=payload.totp_secret,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SetupTotpResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/setup/totp/confirm", response_model=SetupTotpResponse)
def setup_totp_confirm_alias(
    payload: SetupTotpRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(get_current_user),
    claims: TokenClaims = Depends(get_claims),
    x_request_id: Optional[str] = Header(default=None),
):
    # alias -> to samo co /setup/totp
    return setup_totp(
        payload=payload,
        request=request,
        db=db,
        user=user,
        claims=claims,
        x_request_id=x_request_id,
    )


# -----------------------
# RBAC TEST ROUTES
# -----------------------
class PingResponse(BaseModel):
    status: str
    admin_only: bool


@router.get("/rbac/admin-ping", response_model=PingResponse)
def admin_ping(user: StaffUser = Depends(require(Action.RBAC_ADMIN_PING))):
    return PingResponse(status="ok", admin_only=True)


# -----------------------
# WHOAMI (UI / session info)
# -----------------------
class WhoAmIResponse(BaseModel):
    staff_id: int
    username: str
    role: str
    email: Optional[str] = None
    bootstrap_mode: bool
    setup_mode: bool


@router.get("/whoami", response_model=WhoAmIResponse)
def whoami(
    user: StaffUser = Depends(get_current_user),
    claims: TokenClaims = Depends(get_claims),
):
    return WhoAmIResponse(
        staff_id=int(user.id),
        username=user.username,
        role=str(user.role),
        email=user.email,
        bootstrap_mode=bool(getattr(claims, "bootstrap_mode", False)),
        setup_mode=bool(getattr(claims, "setup_mode", False)),
    )


# -----------------------
# SELF-SERVICE (ME)
# -----------------------
class SelfChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password1: str = Field(..., min_length=8, max_length=256)
    new_password2: str = Field(..., min_length=8, max_length=256)


class SelfChangePasswordResponse(BaseModel):
    status: str
    relogin_required: bool


@router.post("/me/password", response_model=SelfChangePasswordResponse)
def self_password_change(
    payload: SelfChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(require(Action.IDENTITY_SELF_PASSWORD_CHANGE)),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = self_change_password(
            db,
            actor=user,
            current_password=payload.current_password,
            new_password=payload.new_password1,
            new_password_repeat=payload.new_password2,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SelfChangePasswordResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class SelfUpdateEmailRequest(BaseModel):
    new_email: str = Field(..., min_length=3, max_length=255)
    current_password: str = Field(..., min_length=1, max_length=256)
    totp_code: str = Field(..., min_length=4, max_length=16)


class SelfUpdateEmailResponse(BaseModel):
    status: str
    email: str
    relogin_required: bool


@router.put("/me/email", response_model=SelfUpdateEmailResponse)
def self_email_update(
    payload: SelfUpdateEmailRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(require(Action.IDENTITY_SELF_EMAIL_UPDATE)),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = self_update_email(
            db,
            actor=user,
            new_email=payload.new_email,
            current_password=payload.current_password,
            totp_code=payload.totp_code,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SelfUpdateEmailResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class SelfTotpResetBeginRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)


class SelfTotpResetBeginResponse(BaseModel):
    status: str
    totp_secret: str
    totp_uri: str
    next: Optional[str] = None


@router.post("/me/totp/reset", response_model=SelfTotpResetBeginResponse)
def self_totp_reset_begin_endpoint(
    payload: SelfTotpResetBeginRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(require(Action.IDENTITY_SELF_TOTP_RESET_BEGIN)),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = self_totp_reset_begin(
            db,
            actor=user,
            current_password=payload.current_password,
            label_username=user.username,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SelfTotpResetBeginResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class SelfTotpResetConfirmRequest(BaseModel):
    totp_code: str = Field(..., min_length=4, max_length=16)
    totp_secret: str = Field(..., min_length=16, max_length=64)


class SelfTotpResetConfirmResponse(BaseModel):
    status: str
    relogin_required: bool


@router.post("/me/totp/reset/confirm", response_model=SelfTotpResetConfirmResponse)
def self_totp_reset_confirm_endpoint(
    payload: SelfTotpResetConfirmRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: StaffUser = Depends(require(Action.IDENTITY_SELF_TOTP_RESET_CONFIRM)),
    x_request_id: Optional[str] = Header(default=None),
):
    try:
        out = self_totp_reset_confirm(
            db,
            actor=user,
            totp_code=payload.totp_code,
            totp_secret=payload.totp_secret,
            actor_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            request_id=x_request_id,
        )
        return SelfTotpResetConfirmResponse(**out)
    except AuthError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
