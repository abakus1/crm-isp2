from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Iterable, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from crm.db.models.contracts import Contract
from crm.db.models.subscriptions import Subscription
from crm.domains.subscriptions.enums import SubscriptionChangeType
from crm.domains.subscriptions.repositories import SubscriptionRepository
from crm.services.billing.date_math import effective_first_day_after_full_next_period, first_day_of_month
from crm.services.billing.payment_plan_service import PaymentPlanService


class SubscriptionUseCaseError(RuntimeError):
    pass


@dataclass(frozen=True)
class NewSubscriptionSpec:
    type: str
    product_code: Optional[str] = None
    tariff_code: Optional[str] = None
    quantity: int = 1
    billing_period_months: int = 1
    service_address_id: Optional[int] = None
    provisioning: Optional[dict[str, Any]] = None


def create_subscriptions_from_contract(
    db: Session,
    *,
    contract_id: int,
    specs: Iterable[NewSubscriptionSpec],
    created_by_staff_id: Optional[int] = None,
) -> list[Subscription]:
    repo = SubscriptionRepository(db)
    out: list[Subscription] = []
    for spec in specs:
        s = repo.create(
            contract_id=contract_id,
            type=spec.type,
            product_code=spec.product_code,
            tariff_code=spec.tariff_code,
            quantity=spec.quantity,
            billing_period_months=spec.billing_period_months,
            service_address_id=spec.service_address_id,
            provisioning=spec.provisioning,
        )
        # snapshot wersji (minimalny, bez rozbudowanej struktury)
        repo.add_version(
            subscription_id=s.id,
            version_no=1,
            snapshot={
                "type": s.type,
                "product_code": s.product_code,
                "tariff_code": s.tariff_code,
                "quantity": s.quantity,
                "billing_period_months": s.billing_period_months,
                "service_address_id": s.service_address_id,
                "provisioning": s.provisioning,
            },
            created_by_staff_id=created_by_staff_id,
        )
        out.append(s)
    return out


def confirm_activation(
    db: Session,
    *,
    contract_id: int,
    activated_at: datetime,
    activation_fee_net: Decimal,
    monthly_net_by_subscription_id: dict[int, Decimal],
    vat_rate: Decimal = Decimal("23.00"),
    currency: str = "PLN",
    staff_user_id: Optional[int] = None,
) -> None:
    # 1) aktywujemy kontrakt
    db.execute(
        sa.update(Contract)
        .where(Contract.id == contract_id)
        .values(status="active", service_start_at=activated_at)
    )

    # 2) aktywujemy subskrypcje + ustawiamy service_start_at
    sub_ids = list(monthly_net_by_subscription_id.keys())
    if sub_ids:
        db.execute(
            sa.update(Subscription)
            .where(Subscription.id.in_(sub_ids))
            .values(status="active", service_start_at=activated_at)
        )

    # 3) generujemy pozycje billingowe: activation_fee + proraty
    pp = PaymentPlanService(db)
    pp.add_activation_fee(
        contract_id=contract_id,
        subscription_id=None,
        activated_at=activated_at,
        net_amount=activation_fee_net,
        vat_rate=vat_rate,
        currency=currency,
    )
    for sub_id, monthly_net in monthly_net_by_subscription_id.items():
        pp.add_prorata_for_activation(
            contract_id=contract_id,
            subscription_id=sub_id,
            activated_at=activated_at,
            monthly_net=monthly_net,
            vat_rate=vat_rate,
            currency=currency,
        )

    # 4) next_billing_at: ustawiamy na 1. dzień kolejnego miesiąca 00:00
    nb = datetime.combine(first_day_of_month(activated_at.date()), datetime.min.time())
    # nb to pierwszy dzień bieżącego miesiąca, więc +1 miesiąc
    if nb.month == 12:
        nb = nb.replace(year=nb.year + 1, month=1)
    else:
        nb = nb.replace(month=nb.month + 1)
    if sub_ids:
        db.execute(sa.update(Subscription).where(Subscription.id.in_(sub_ids)).values(next_billing_at=nb))


def generate_monthly_recurring(
    db: Session,
    *,
    contract_id: int,
    billing_month: date,
    monthly_net_by_subscription_id: dict[int, Decimal],
    vat_rate: Decimal = Decimal("23.00"),
    currency: str = "PLN",
) -> None:
    pp = PaymentPlanService(db)
    for sub_id, monthly_net in monthly_net_by_subscription_id.items():
        pp.add_recurring_monthly(
            contract_id=contract_id,
            subscription_id=sub_id,
            billing_month=billing_month,
            monthly_net=monthly_net,
            vat_rate=vat_rate,
            currency=currency,
        )


def schedule_downgrade(
    db: Session,
    *,
    subscription_id: int,
    requested_at: datetime,
    payload: dict[str, Any],
    note: Optional[str] = None,
    requested_by_staff_user_id: Optional[int] = None,
) -> int:
    repo = SubscriptionRepository(db)
    effective = effective_first_day_after_full_next_period(requested_at.date())
    req = repo.create_change_request(
        subscription_id=subscription_id,
        change_type=SubscriptionChangeType.DOWNGRADE,
        effective_at=effective,
        requested_by_staff_user_id=requested_by_staff_user_id,
        note=note,
        payload=payload,
    )
    return req.id


def schedule_termination(
    db: Session,
    *,
    subscription_id: int,
    requested_at: datetime,
    payload: Optional[dict[str, Any]] = None,
    note: Optional[str] = None,
    requested_by_staff_user_id: Optional[int] = None,
) -> int:
    repo = SubscriptionRepository(db)
    effective = effective_first_day_after_full_next_period(requested_at.date())
    req = repo.create_change_request(
        subscription_id=subscription_id,
        change_type=SubscriptionChangeType.TERMINATE,
        effective_at=effective,
        requested_by_staff_user_id=requested_by_staff_user_id,
        note=note,
        payload=payload or {},
    )
    return req.id


def apply_due_change_requests(db: Session, *, now: datetime | date | None = None, limit: int = 500) -> int:
    """Applier: pending -> applied.

    Minimalny mechanizm, żeby change requesty nie były tylko „papierem w segregatorze”.
    Docelowo: każdy typ zmiany będzie miał własne reguły + audit/outbox.
    """
    if now is None:
        now_dt = datetime.now(tz=timezone.utc)
    elif isinstance(now, datetime):
        now_dt = now
    else:
        now_dt = datetime.combine(now, time.min, tzinfo=timezone.utc)

    today = now_dt.date()
    repo = SubscriptionRepository(db)

    due = repo.list_due_pending_change_requests(now=today, limit=limit)
    applied = 0

    for req in due:
        sub = repo.get(req.subscription_id)
        if sub is None:
            # dangling FK raczej nie powinno się zdarzyć, ale nie blokujemy kolejki
            req.status = SubscriptionChangeType.TERMINATE  # type: ignore[assignment]
            continue

        ct = req.change_type

        if ct in (SubscriptionChangeType.UPGRADE, SubscriptionChangeType.DOWNGRADE):
            new_tariff = (req.payload or {}).get("new_tariff_code") or (req.payload or {}).get("tariff_code")
            if not new_tariff:
                raise SubscriptionUseCaseError(f"Missing new_tariff_code in payload for change_request={req.id}")
            sub.tariff_code = str(new_tariff)

        elif ct == SubscriptionChangeType.TERMINATE:
            sub.status = "terminated"
            sub.service_end_at = datetime.combine(req.effective_at, time.min, tzinfo=timezone.utc)

        elif ct == SubscriptionChangeType.SUSPEND:
            sub.status = "suspended"

        elif ct == SubscriptionChangeType.RESUME:
            # jeśli ktoś wznawia — przyjmujemy, że usługa jest aktywna
            sub.status = "active"

        else:
            raise SubscriptionUseCaseError(f"Unsupported change_type={ct} for change_request={req.id}")

        req.status = "applied"
        sub.updated_at = now_dt
        req.updated_at = now_dt
        applied += 1

    db.flush()
    return applied

