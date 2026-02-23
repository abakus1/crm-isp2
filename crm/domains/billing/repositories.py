from __future__ import annotations

from datetime import date
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from crm.db.models.billing import PaymentPlanItem


class PaymentPlanRepoError(RuntimeError):
    pass


class PaymentPlanRepository:
    """Repo dla payment_plan_items.

    To jest „ledger” do przyszłego billing engine: generujemy pozycje,
    a księgowość/Optima dostanie je przez export/outbox.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def list_for_contract(self, contract_id: int, *, limit: int = 500, offset: int = 0) -> list[PaymentPlanItem]:
        stmt = (
            sa.select(PaymentPlanItem)
            .where(PaymentPlanItem.contract_id == contract_id)
            .order_by(PaymentPlanItem.billing_month.asc(), PaymentPlanItem.id.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._db.execute(stmt).scalars().all())

    def list_for_contract_month(self, contract_id: int, *, billing_month: date) -> list[PaymentPlanItem]:
        stmt = (
            sa.select(PaymentPlanItem)
            .where(PaymentPlanItem.contract_id == contract_id)
            .where(PaymentPlanItem.billing_month == billing_month)
            .order_by(PaymentPlanItem.id.asc())
        )
        return list(self._db.execute(stmt).scalars().all())

    def create_item(
        self,
        *,
        contract_id: int,
        subscription_id: Optional[int],
        item_type: str,
        billing_month: date,
        net_amount: float,
        gross_amount: float,
        vat_rate: float = 23.0,
        currency: str = "PLN",
        period_start: Optional[date] = None,
        period_end: Optional[date] = None,
        description: Optional[str] = None,
        meta: Optional[dict[str, Any]] = None,
    ) -> PaymentPlanItem:
        item = PaymentPlanItem(
            contract_id=contract_id,
            subscription_id=subscription_id,
            item_type=item_type,
            billing_month=billing_month,
            period_start=period_start,
            period_end=period_end,
            description=description,
            currency=currency,
            net_amount=net_amount,
            vat_rate=vat_rate,
            gross_amount=gross_amount,
            meta=meta,
        )
        self._db.add(item)
        self._db.flush()
        return item
