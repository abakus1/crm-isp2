from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_DOWN

from sqlalchemy.orm import Session

from crm.domains.pricing.enums import PriceScheduleSource
from crm.domains.pricing.repositories import (
    CatalogRepository,
    PricePoint,
    SubscriptionPriceScheduleRepository,
)
from crm.services.billing.date_math import add_months, first_day_of_month


# Primary (root) jest wyliczane z DB: is_primary=True AND parent_subscription_id IS NULL.


def _q2(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"))


def _allocate(amount: Decimal, n: int) -> list[Decimal]:
    """Rozdziel kwotę na n części (groszowo), tak żeby suma była równa amount."""
    if n <= 0:
        return []

    # base (obcięte do groszy w dół)
    base = (amount / Decimal(n)).quantize(Decimal("0.01"), rounding=ROUND_DOWN)
    parts = [base for _ in range(n)]
    rest = _q2(amount - (base * Decimal(n)))

    # rozdajemy resztę po 0.01
    step = Decimal("0.01")
    i = 0
    while rest != Decimal("0.00"):
        parts[i] = _q2(parts[i] + (step if rest > 0 else -step))
        rest = _q2(rest - (step if rest > 0 else -step))
        i = (i + 1) % n
    return parts


@dataclass(frozen=True)
class ContractPricingTerms:
    is_indefinite: bool
    term_months: int | None
    service_start_month: date
    horizon_months: int

    post_term_increase_enabled: bool
    post_term_increase_amount: Decimal

    annual_increase_enabled: bool
    annual_increase_amount: Decimal
    annual_increase_every_months: int


class PriceScheduleBuilderService:
    """Buduje snapshot harmonogramu cen subskrypcji (katalog + polityki kontraktu).

    Billing engine MA patrzeć tylko na subscription_price_schedule_events.
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._catalog = CatalogRepository(db)
        self._sub_sched = SubscriptionPriceScheduleRepository(db)

    def build_and_persist_for_subscriptions(
        self,
        *,
        contract_terms: ContractPricingTerms,
        subscriptions: list[dict],
    ) -> None:
        """Buduje i zapisuje harmonogram dla listy subskrypcji.

        subscriptions: minimalne dicty: {id, type, product_code}
        """

        # 1) policz primary subs do rozdziału podwyżek
        primary = [
            s
            for s in subscriptions
            if s.get("is_primary") is True
            and s.get("parent_subscription_id") in (None, 0)
            and s.get("product_code")
        ]
        n_primary = len(primary)

        # 2) zbuduj bazę z katalogu per sub
        base_events_by_sub: dict[int, list[PricePoint]] = {}
        for s in subscriptions:
            sid = int(s["id"])
            pcode = s.get("product_code")
            if not pcode:
                base_events_by_sub[sid] = []
                continue

            prod = self._catalog.get_product_by_code(str(pcode))
            if not prod:
                # brak w katalogu -> brak harmonogramu (na razie). To jest świadomy fail-open dla foundation.
                base_events_by_sub[sid] = []
                continue

            points = self._catalog.list_price_points(product_id=prod.id)
            # ogranicz do horyzontu + dodaj "pierwszy" punkt jeśli zaczyna się po start_month
            start = contract_terms.service_start_month
            end = add_months(start, contract_terms.horizon_months)
            points = [p for p in points if p.effective_month < end]
            base_events_by_sub[sid] = points

        # 3) apply post-term increase (jednorazowo) na primary
        if (
            contract_terms.post_term_increase_enabled
            and not contract_terms.is_indefinite
            and (contract_terms.term_months or 0) > 0
            and n_primary > 0
            and contract_terms.post_term_increase_amount != Decimal("0.00")
        ):
            eff_month = add_months(contract_terms.service_start_month, int(contract_terms.term_months or 0))
            parts = _allocate(contract_terms.post_term_increase_amount, n_primary)
            for idx, s in enumerate(primary):
                sid = int(s["id"])
                self._apply_absolute_price_change(
                    base_events_by_sub[sid],
                    effective_month=eff_month,
                    delta=parts[idx],
                    source=PriceScheduleSource.CONTRACT_POST_TERM,
                    note="Podwyżka po zakończeniu terminu umowy",
                )

        # 4) apply annual increases (co N miesięcy)
        if (
            contract_terms.annual_increase_enabled
            and contract_terms.annual_increase_every_months > 0
            and n_primary > 0
            and contract_terms.annual_increase_amount != Decimal("0.00")
        ):
            # domyślna interpretacja (bez dodatkowego pola start_from):
            # - dla umów terminowych: start od miesiąca po term_end (żeby nie mieszać z promocyjnym okresem)
            # - dla bezterminowych: start po N miesiącach od startu
            if not contract_terms.is_indefinite and (contract_terms.term_months or 0) > 0:
                first_increase_month = add_months(contract_terms.service_start_month, int(contract_terms.term_months or 0) + contract_terms.annual_increase_every_months)
            else:
                first_increase_month = add_months(contract_terms.service_start_month, contract_terms.annual_increase_every_months)

            end = add_months(contract_terms.service_start_month, contract_terms.horizon_months)

            parts = _allocate(contract_terms.annual_increase_amount, n_primary)
            m = first_increase_month
            while m < end:
                for idx, s in enumerate(primary):
                    sid = int(s["id"])
                    self._apply_absolute_price_change(
                        base_events_by_sub[sid],
                        effective_month=m,
                        delta=parts[idx],
                        source=PriceScheduleSource.CONTRACT_ANNUAL,
                        note="Cykliczna podwyżka kontraktowa",
                    )
                m = add_months(m, contract_terms.annual_increase_every_months)

        # 5) persist (replace snapshot)
        for s in subscriptions:
            sid = int(s["id"])
            evs = base_events_by_sub.get(sid, [])
            # normalizuj miesiące do 1 dnia
            norm = [
                PricePoint(
                    effective_month=first_day_of_month(p.effective_month),
                    monthly_net=_q2(p.monthly_net),
                    vat_rate=_q2(p.vat_rate),
                    currency=p.currency,
                    source=p.source,
                )
                for p in evs
            ]
            # uporządkuj i deduplikuj po effective_month (ostatni wygrywa)
            norm.sort(key=lambda x: x.effective_month)
            dedup: dict[date, PricePoint] = {}
            for p in norm:
                dedup[p.effective_month] = p
            final = list(sorted(dedup.values(), key=lambda x: x.effective_month))

            self._sub_sched.replace_events(
                subscription_id=sid,
                events=final,
                source_default=PriceScheduleSource.CATALOG,
            )

    def _price_at(self, events: list[PricePoint], month: date) -> PricePoint | None:
        """Ostatnia cena <= month."""
        candidates = [e for e in events if e.effective_month <= month]
        if not candidates:
            return None
        return sorted(candidates, key=lambda x: x.effective_month)[-1]

    def _apply_absolute_price_change(
        self,
        events: list[PricePoint],
        *,
        effective_month: date,
        delta: Decimal,
        source: PriceScheduleSource,
        note: str,
    ) -> None:
        month = first_day_of_month(effective_month)
        base = self._price_at(events, month)
        if not base:
            # brak bazowej ceny - nie nakładamy podwyżek (fundament, brak katalogu)
            return
        new_price = _q2(base.monthly_net + delta)
        events.append(
            PricePoint(
                effective_month=month,
                monthly_net=new_price,
                vat_rate=base.vat_rate,
                currency=base.currency,
                source=str(source),
            )
        )
