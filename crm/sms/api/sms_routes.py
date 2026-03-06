from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.session import get_db
from crm.db.models.staff import StaffUser
from crm.adapters.sms import SmeskomApiError, SmeskomClient, SmeskomConnectionSettings
from crm.users.identity.jwt_deps import get_current_user
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

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


class SmeskomTestOut(BaseModel):
    ok: bool
    base_url_used: str
    auth_mode: Literal["basic", "body"]
    http_status: int | None
    provider_message: str
    response_excerpt: str | None = None


@router.get(
    "/config/smeskom/state",
    response_model=SmeskomStateOut,
    dependencies=[Depends(require(Action.SMS_CONFIG_READ))],
)
def smeskom_state(
    _db: Session = Depends(get_db),
    _me: StaffUser = Depends(get_current_user),
):
    settings = get_settings()
    payload = settings.smeskom.sanitized()
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
