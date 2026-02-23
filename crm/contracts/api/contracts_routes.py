# crm/contracts/api/contracts_routes.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from crm.contracts.schemas import SubscriptionCreateIn, SubscriptionOut, SubscriptionUpdateIn
from crm.core.audit.activity_context import set_activity_entity
from crm.db.models.contracts import Contract
from crm.db.models.staff import AuditLog, StaffUser
from crm.db.models.subscriptions import Subscription
from crm.db.session import get_db
from crm.shared.request_context import get_request_context
from crm.services.subscriptions.subscription_service import SubscriptionService
from crm.shared.errors import ValidationError
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require


router = APIRouter(prefix="/contracts", tags=["contracts"])


def _audit(
    *,
    db: Session,
    actor_staff_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict | None,
    after: dict | None,
    meta: dict | None = None,
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


def _sub_out(s: Subscription) -> SubscriptionOut:
    return SubscriptionOut(
        id=int(s.id),
        contract_id=int(s.contract_id),
        type=str(s.type),
        status=str(s.status),
        is_primary=bool(s.is_primary),
        parent_subscription_id=int(s.parent_subscription_id) if s.parent_subscription_id is not None else None,
        product_code=s.product_code,
        tariff_code=s.tariff_code,
        quantity=int(s.quantity),
        billing_period_months=int(s.billing_period_months),
        service_address_id=int(s.service_address_id) if s.service_address_id is not None else None,
        provisioning=dict(s.provisioning) if s.provisioning else None,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _ensure_contract(db: Session, contract_id: int) -> Contract:
    c = db.get(Contract, int(contract_id))
    if not c:
        raise HTTPException(status_code=404, detail="Kontrakt nie istnieje")
    return c


def _validate_requirements_or_400(db: Session, contract_id: int) -> None:
    try:
        SubscriptionService(db).validate_requirements(contract_id=int(contract_id))
    except ValidationError as e:
        # wymagania to "hard gate" — żadnych pół-zapisów
        db.rollback()
        raise HTTPException(status_code=400, detail={"message": str(e), "details": getattr(e, "details", None)})


@router.get("/{contract_id}/subscriptions", response_model=list[SubscriptionOut])
def contract_subscriptions_list(
    contract_id: int,
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.CONTRACTS_READ)),
):
    _ensure_contract(db, contract_id)
    rows = (
        db.query(Subscription)
        .filter(Subscription.contract_id == int(contract_id))
        .order_by(Subscription.id.asc())
        .all()
    )
    return [_sub_out(s) for s in rows]


@router.post("/{contract_id}/subscriptions", response_model=SubscriptionOut)
def contract_subscriptions_create(
    contract_id: int,
    payload: SubscriptionCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CONTRACTS_WRITE)),
):
    _ensure_contract(db, contract_id)

    s = Subscription(
        contract_id=int(contract_id),
        type=payload.type,
        product_code=payload.product_code,
        tariff_code=payload.tariff_code,
        quantity=int(payload.quantity),
        billing_period_months=int(payload.billing_period_months),
        is_primary=(payload.is_primary if payload.is_primary is not None else (payload.type != "addon")),
        parent_subscription_id=int(payload.parent_subscription_id) if payload.parent_subscription_id is not None else None,
        service_address_id=int(payload.service_address_id) if payload.service_address_id is not None else None,
        provisioning=payload.provisioning,
    )
    db.add(s)
    db.flush()

    # gate: wymagania addonów
    _validate_requirements_or_400(db, contract_id)

    set_activity_entity(request, entity_type="subscription", entity_id=str(s.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CONTRACT_SUBSCRIPTION_CREATE",
        entity_type="subscriptions",
        entity_id=str(s.id),
        before=None,
        after={
            "contract_id": int(contract_id),
            "type": payload.type,
            "product_code": payload.product_code,
            "tariff_code": payload.tariff_code,
            "quantity": int(payload.quantity),
            "is_primary": bool(s.is_primary),
            "parent_subscription_id": s.parent_subscription_id,
        },
        severity="critical",
    )
    db.commit()
    return _sub_out(s)


@router.put("/{contract_id}/subscriptions/{subscription_id}", response_model=SubscriptionOut)
def contract_subscriptions_update(
    contract_id: int,
    subscription_id: int,
    payload: SubscriptionUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CONTRACTS_WRITE)),
):
    _ensure_contract(db, contract_id)
    s = db.get(Subscription, int(subscription_id))
    if not s or int(s.contract_id) != int(contract_id):
        raise HTTPException(status_code=404, detail="Subskrypcja nie istnieje")

    before = {
        "product_code": s.product_code,
        "tariff_code": s.tariff_code,
        "quantity": int(s.quantity),
        "billing_period_months": int(s.billing_period_months),
        "is_primary": bool(s.is_primary),
        "parent_subscription_id": int(s.parent_subscription_id) if s.parent_subscription_id is not None else None,
        "service_address_id": int(s.service_address_id) if s.service_address_id is not None else None,
    }

    s.product_code = payload.product_code
    s.tariff_code = payload.tariff_code
    s.quantity = int(payload.quantity)
    s.billing_period_months = int(payload.billing_period_months)
    if payload.is_primary is not None:
        s.is_primary = bool(payload.is_primary)
    s.parent_subscription_id = int(payload.parent_subscription_id) if payload.parent_subscription_id is not None else None
    s.service_address_id = int(payload.service_address_id) if payload.service_address_id is not None else None
    s.provisioning = payload.provisioning
    db.flush()

    _validate_requirements_or_400(db, contract_id)

    set_activity_entity(request, entity_type="subscription", entity_id=str(s.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CONTRACT_SUBSCRIPTION_UPDATE",
        entity_type="subscriptions",
        entity_id=str(s.id),
        before=before,
        after={
            "product_code": s.product_code,
            "tariff_code": s.tariff_code,
            "quantity": int(s.quantity),
            "billing_period_months": int(s.billing_period_months),
            "is_primary": bool(s.is_primary),
            "parent_subscription_id": int(s.parent_subscription_id) if s.parent_subscription_id is not None else None,
            "service_address_id": int(s.service_address_id) if s.service_address_id is not None else None,
        },
        severity="critical",
    )
    db.commit()
    return _sub_out(s)


@router.delete("/{contract_id}/subscriptions/{subscription_id}")
def contract_subscriptions_delete(
    contract_id: int,
    subscription_id: int,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CONTRACTS_WRITE)),
):
    _ensure_contract(db, contract_id)
    s = db.get(Subscription, int(subscription_id))
    if not s or int(s.contract_id) != int(contract_id):
        raise HTTPException(status_code=404, detail="Subskrypcja nie istnieje")

    before = {
        "type": str(s.type),
        "product_code": s.product_code,
        "quantity": int(s.quantity),
        "is_primary": bool(s.is_primary),
        "parent_subscription_id": int(s.parent_subscription_id) if s.parent_subscription_id is not None else None,
    }

    set_activity_entity(request, entity_type="subscription", entity_id=str(s.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CONTRACT_SUBSCRIPTION_DELETE",
        entity_type="subscriptions",
        entity_id=str(s.id),
        before=before,
        after=None,
        severity="critical",
    )

    db.delete(s)
    db.flush()

    _validate_requirements_or_400(db, contract_id)

    db.commit()
    return {"status": "ok"}
