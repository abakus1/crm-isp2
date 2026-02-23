from __future__ import annotations

from datetime import date
from typing import Optional

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
        amount_net: float,
        amount_gross: float,
        vat_rate: float = 0.0,
        currency: str = "PLN",
        period_start: date = None,  # type: ignore[assignment]
        period_end: date = None,  # type: ignore[assignment]
        description: Optional[str] = None,
        external_document_id: Optional[str] = None,
    ) -> PaymentPlanItem:
        if period_start is None or period_end is None:
            raise PaymentPlanRepoError("period_start i period_end są wymagane (DB constraint)")
        item = PaymentPlanItem(
            contract_id=contract_id,
            subscription_id=subscription_id,
            item_type=item_type,
            billing_month=billing_month,
            period_start=period_start,
            period_end=period_end,
            description=description,
            currency=currency,
            amount_net=amount_net,
            vat_rate=vat_rate,
            amount_gross=amount_gross,
            external_document_id=external_document_id,
        )
        self._db.add(item)
        self._db.flush()
        return item
