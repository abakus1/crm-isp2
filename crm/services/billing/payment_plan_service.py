from __future__ import annotations

import hashlib

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session

from crm.domains.billing.enums import PaymentPlanItemType
from crm.domains.billing.repositories import PaymentPlanRepository
from crm.services.billing.date_math import first_day_of_month, last_day_of_month

def _make_idempotency_key(*parts: object) -> str:
    """Deterministyczny klucz idempotencji.

    Cel: generator może próbować „tworzyć w ciemno”, a DB utnie duplikat po tym kluczu.
    Klucz ma być stabilny względem *znaczenia biznesowego* pozycji, a nie np. ID zewnętrznych.
    """
    raw = "|".join("" if p is None else str(p) for p in parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()



def _q2(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Money:
    net: Decimal
    vat_rate: Decimal
    gross: Decimal


def compute_gross(net: Decimal, vat_rate: Decimal) -> Decimal:
    return _q2(net * (Decimal("1") + (vat_rate / Decimal("100"))))


def compute_30_day_prorata(monthly_net: Decimal, *, days: int) -> Decimal:
    # Kanoniczna reguła: prorata 30-dniowa (nie zależy od długości miesiąca).
    return _q2(monthly_net * Decimal(days) / Decimal(30))


class PaymentPlanService:
    """Minimalna warstwa use-case dla payment_plan_items.

    Na razie bez księgowości/Optimy. Zapisujemy tylko plan pozycji.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = PaymentPlanRepository(db)

    def add_activation_fee(
        self,
        *,
        contract_id: int,
        subscription_id: Optional[int],
        activated_at: datetime,
        net_amount: Decimal,
        vat_rate: Decimal = Decimal("23.00"),
        currency: str = "PLN",
        description: str | None = None,
    ) -> int:
        d = activated_at.date()
        billing_month = first_day_of_month(d)
        gross = compute_gross(net_amount, vat_rate)

        item = self._repo.create_item(
            contract_id=contract_id,
            subscription_id=subscription_id,
            item_type=PaymentPlanItemType.ACTIVATION_FEE,
            billing_month=billing_month,
            period_start=d,
            period_end=d,
            amount_net=float(net_amount),
            vat_rate=float(vat_rate),
            amount_gross=float(gross),
            currency=currency,
            description=description or "Opłata aktywacyjna",
            idempotency_key=_make_idempotency_key(
                "activation_fee",
                contract_id,
                subscription_id,
                billing_month,
                d,
                net_amount,
                vat_rate,
            ),
        )
        return item.id

    def add_prorata_for_activation(
        self,
        *,
        contract_id: int,
        subscription_id: int,
        activated_at: datetime,
        monthly_net: Decimal,
        vat_rate: Decimal = Decimal("23.00"),
        currency: str = "PLN",
        description: str | None = None,
    ) -> int:
        start = activated_at.date()
        end = last_day_of_month(start)
        days = (end - start).days + 1
        net = compute_30_day_prorata(monthly_net, days=days)
        gross = compute_gross(net, vat_rate)
        billing_month = first_day_of_month(start)

        item = self._repo.create_item(
            contract_id=contract_id,
            subscription_id=subscription_id,
            item_type=PaymentPlanItemType.PRORATA,
            billing_month=billing_month,
            period_start=start,
            period_end=end,
            amount_net=float(net),
            vat_rate=float(vat_rate),
            amount_gross=float(gross),
            currency=currency,
            description=description or "Prorata za aktywację",
            idempotency_key=_make_idempotency_key(
                "prorata_activation",
                contract_id,
                subscription_id,
                billing_month,
                start,
                end,
                monthly_net,
                vat_rate,
            ),
        )
        return item.id

    def add_recurring_monthly(
        self,
        *,
        contract_id: int,
        subscription_id: int,
        billing_month: date,
        monthly_net: Decimal,
        vat_rate: Decimal = Decimal("23.00"),
        currency: str = "PLN",
        description: str | None = None,
    ) -> int:
        month_bucket = first_day_of_month(billing_month)
        start = month_bucket
        end = last_day_of_month(month_bucket)
        gross = compute_gross(monthly_net, vat_rate)

        item = self._repo.create_item(
            contract_id=contract_id,
            subscription_id=subscription_id,
            item_type=PaymentPlanItemType.RECURRING_MONTHLY,
            billing_month=month_bucket,
            period_start=start,
            period_end=end,
            amount_net=float(monthly_net),
            vat_rate=float(vat_rate),
            amount_gross=float(gross),
            currency=currency,
            description=description or "Abonament miesięczny",
            idempotency_key=_make_idempotency_key(
                "recurring_monthly",
                contract_id,
                subscription_id,
                month_bucket,
                monthly_net,
                vat_rate,
            ),
        )
        return item.id
