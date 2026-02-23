from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from crm.db.models.pricing import CatalogPriceScheduleEvent, CatalogProduct, CatalogProductRequirement, SubscriptionPriceScheduleEvent


@dataclass(frozen=True)
class PricePoint:
    effective_month: date
    monthly_net: Decimal
    vat_rate: Decimal
    currency: str
    source: str | None = None


class CatalogRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_product_by_code(self, code: str) -> CatalogProduct | None:
        stmt = select(CatalogProduct).where(CatalogProduct.code == code)
        return self._db.execute(stmt).scalars().first()

    def get_or_create_product(self, *, code: str, type: str, name: str) -> CatalogProduct:
        p = self.get_product_by_code(code)
        if p:
            return p
        p = CatalogProduct(code=code, type=type, name=name)
        self._db.add(p)
        self._db.flush()
        return p

    def list_price_events(self, *, product_id: int) -> list[CatalogPriceScheduleEvent]:
        stmt = (
            select(CatalogPriceScheduleEvent)
            .where(CatalogPriceScheduleEvent.product_id == product_id)
            .order_by(CatalogPriceScheduleEvent.effective_month.asc())
        )
        return list(self._db.execute(stmt).scalars().all())

    def list_price_points(self, *, product_id: int) -> list[PricePoint]:
        evs = self.list_price_events(product_id=product_id)
        return [
            PricePoint(
                effective_month=e.effective_month,
                monthly_net=Decimal(str(e.monthly_net)),
                vat_rate=Decimal(str(e.vat_rate)),
                currency=e.currency,
                source="catalog",
            )
            for e in evs
        ]


class SubscriptionPriceScheduleRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_events(self, *, subscription_id: int) -> list[SubscriptionPriceScheduleEvent]:
        stmt = (
            select(SubscriptionPriceScheduleEvent)
            .where(SubscriptionPriceScheduleEvent.subscription_id == subscription_id)
            .order_by(SubscriptionPriceScheduleEvent.effective_month.asc())
        )
        return list(self._db.execute(stmt).scalars().all())

    def list_price_points(self, *, subscription_id: int) -> list[PricePoint]:
        evs = self.list_events(subscription_id=subscription_id)
        return [
            PricePoint(
                effective_month=e.effective_month,
                monthly_net=Decimal(str(e.monthly_net)),
                vat_rate=Decimal(str(e.vat_rate)),
                currency=e.currency,
                source=str(e.source),
            )
            for e in evs
        ]

    def replace_events(
        self,
        *,
        subscription_id: int,
        events: list[PricePoint],
        source_default: str,
        note: str | None = None,
        meta: dict | None = None,
    ) -> None:
        # hard replace: kasujemy i wstawiamy od nowa.
        # to jest bezpieczne, bo jest to snapshot harmonogramu po aneksie/podpisie.
        self._db.query(SubscriptionPriceScheduleEvent).filter(
            SubscriptionPriceScheduleEvent.subscription_id == subscription_id
        ).delete(synchronize_session=False)

        for p in events:
            self._db.add(
                SubscriptionPriceScheduleEvent(
                    subscription_id=subscription_id,
                    source=(p.source or source_default),
                    effective_month=p.effective_month,
                    monthly_net=float(p.monthly_net),
                    vat_rate=float(p.vat_rate),
                    currency=p.currency,
                    note=note,
                    meta=meta or {},
                )
            )

        self._db.flush()

    def price_for_month(self, *, subscription_id: int, month: date) -> PricePoint | None:
        """Zwraca obowiązującą cenę na dany miesiąc (bucket = pierwszy dzień miesiąca)."""
        stmt = (
            select(SubscriptionPriceScheduleEvent)
            .where(SubscriptionPriceScheduleEvent.subscription_id == subscription_id)
            .where(SubscriptionPriceScheduleEvent.effective_month <= month)
            .order_by(SubscriptionPriceScheduleEvent.effective_month.desc())
            .limit(1)
        )
        e = self._db.execute(stmt).scalars().first()
        if not e:
            return None
        return PricePoint(
            effective_month=e.effective_month,
            monthly_net=Decimal(str(e.monthly_net)),
            vat_rate=Decimal(str(e.vat_rate)),
            currency=e.currency,
            source=str(e.source),
        )


class CatalogProductRequirementRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_for_primary_product(self, primary_product_id: int) -> list[CatalogProductRequirement]:
        stmt = (
            select(CatalogProductRequirement)
            .where(CatalogProductRequirement.primary_product_id == primary_product_id)
            .order_by(CatalogProductRequirement.id.asc())
        )
        return list(self._db.execute(stmt).scalars().all())

