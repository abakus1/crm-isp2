from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.adapters.sms import SmeskomApiError, SmeskomClient, SmeskomConnectionSettings
from crm.users.identity.jwt_deps import get_current_user
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require
from crm.sms.services import SmsConfigService, SmsConfigValidationError, SmeskomWebhookService

router = APIRouter(prefix="/sms", tags=["sms"])


class SmeskomStateOut(BaseModel):
    enabled: bool
    primary_base_url: str
    secondary_base_url: str
    auth_mode: Literal["basic", "body"]
    login: str
    has_password: bool
    timeout_seconds: int
    callback_enabled: bool
    callback_url: str
    has_callback_secret: bool
    inbound_mode: Literal["callback", "polling"]
    receive_mark_as_read: bool
    receive_poll_interval_seconds: int
    provider_name: str = "SMeSKom"
    persistence_mode: str = "env"


class SmeskomTestIn(BaseModel):
    primary_base_url: str = Field(default="https://api1.smeskom.pl/api/v1")
    secondary_base_url: str = Field(default="https://api2.smeskom.pl/api/v1")
    auth_mode: Literal["basic", "body"] = "basic"
    login: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=256)
    timeout_seconds: int = Field(default=10, ge=1, le=60)


class SmeskomSaveIn(BaseModel):
    enabled: bool = False
    primary_base_url: str = Field(default="https://api1.smeskom.pl/api/v1", min_length=1)
    secondary_base_url: str = Field(default="https://api2.smeskom.pl/api/v1", min_length=1)
    auth_mode: Literal["basic", "body"] = "basic"
    login: str = Field(min_length=1, max_length=128)
    password: str | None = Field(default=None, max_length=256)
    timeout_seconds: int = Field(default=10, ge=1, le=60)
    callback_enabled: bool = False
    callback_url: str = ""
    callback_secret: str | None = Field(default=None, max_length=512)
    inbound_mode: Literal["callback", "polling"] = "callback"
    receive_mark_as_read: bool = True
    receive_poll_interval_seconds: int = Field(default=60, ge=5, le=3600)


class SmeskomTestOut(BaseModel):
    ok: bool
    base_url_used: str
    auth_mode: Literal["basic", "body"]
    http_status: int | None
    provider_message: str
    response_excerpt: str | None = None


class SmeskomWebhookOut(BaseModel):
    ok: bool = True
    accepted: bool
    event_id: int
    event_kind: str
    status: str


@router.get(
    "/config/smeskom/state",
    response_model=SmeskomStateOut,
    dependencies=[Depends(require(Action.SMS_CONFIG_READ))],
)
def smeskom_state(
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    service = SmsConfigService(db)
    effective, persistence_mode = service.get_effective_settings()
    payload = effective.sanitized()
    payload["persistence_mode"] = persistence_mode
    return SmeskomStateOut(**payload)


@router.post(
    "/config/smeskom/test-connection",
    response_model=SmeskomTestOut,
    dependencies=[Depends(require(Action.SMS_CONFIG_WRITE))],
)
def smeskom_test_connection(
    body: SmeskomTestIn,
    _db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    client = SmeskomClient(
        SmeskomConnectionSettings(
            enabled=True,
            primary_base_url=body.primary_base_url,
            secondary_base_url=body.secondary_base_url,
            auth_mode=body.auth_mode,
            login=body.login,
            password=body.password,
            timeout_seconds=body.timeout_seconds,
        )
    )
    try:
        result = client.ping()
        return SmeskomTestOut(**result.__dict__)
    except SmeskomApiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put(
    "/config/smeskom",
    response_model=SmeskomStateOut,
    dependencies=[Depends(require(Action.SMS_CONFIG_WRITE))],
)
def smeskom_save_config(
    body: SmeskomSaveIn,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(get_current_user),
):
    service = SmsConfigService(db)
    try:
        service.upsert_config(body.model_dump(), actor_staff_id=int(me.id))
        effective, persistence_mode = service.get_effective_settings()
        payload = effective.sanitized()
        payload["persistence_mode"] = persistence_mode
        return SmeskomStateOut(**payload)
    except SmsConfigValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.api_route(
    "/hooks/smeskom",
    methods=["GET", "POST"],
    response_model=SmeskomWebhookOut,
    include_in_schema=False,
)
async def smeskom_webhook_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    service = SmeskomWebhookService(db)
    event = await service.handle_callback(request)
    accepted = event.status == "accepted"
    code = 200 if accepted else 401
    return JSONResponse(
        status_code=code,
        content=SmeskomWebhookOut(
            accepted=accepted,
            event_id=int(event.id),
            event_kind=str(event.event_kind),
            status=str(event.status),
        ).model_dump(),
    )
