from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from crm.domains.pricing.repositories import CatalogRepository, CatalogProductRequirementRepository
from crm.db.models.pricing import CatalogProduct
from crm.domains.subscriptions.repositories import SubscriptionRepository
from crm.shared.errors import ValidationError


@dataclass(frozen=True)
class RequirementViolation:
    primary_subscription_id: int
    required_product_code: str
    min_qty: int
    found_qty: int
    is_hard_required: bool


class SubscriptionService:
    """Logika domenowa subskrypcji (bez HTTP).

    validate_requirements() jest celowo "nudne":
    - źródło prawdy: DB + katalog
    - żadnych if-ów w stylu "internet wymaga ont" w kodzie
    """

    def __init__(self, db: Session) -> None:
        self._db = db
        self._subs = SubscriptionRepository(db)
        self._catalog = CatalogRepository(db)
        self._reqs = CatalogProductRequirementRepository(db)

    def validate_requirements(self, *, contract_id: int) -> None:
        subs = self._subs.list_for_contract(contract_id, limit=1000, offset=0)

        by_id = {int(s.id): s for s in subs}

        # A) walidacja parent-child dla addonów
        for s in subs:
            if s.is_primary:
                continue

            if s.parent_subscription_id is None:
                raise ValidationError(
                    message=f"Addon subscription {s.id} musi mieć parent_subscription_id (przypięcie do głównej usługi).",
                    details={"subscription_id": int(s.id), "contract_id": int(contract_id)},
                )

            parent = by_id.get(int(s.parent_subscription_id))
            if not parent:
                raise ValidationError(
                    message=f"Addon subscription {s.id} ma parent_subscription_id={s.parent_subscription_id}, ale parent nie istnieje w tym kontrakcie.",
                    details={
                        "subscription_id": int(s.id),
                        "parent_subscription_id": int(s.parent_subscription_id),
                        "contract_id": int(contract_id),
                    },
                )

            if int(parent.contract_id) != int(contract_id):
                raise ValidationError(
                    message=f"Addon subscription {s.id} wskazuje parent z innego kontraktu.",
                    details={
                        "subscription_id": int(s.id),
                        "parent_subscription_id": int(s.parent_subscription_id),
                        "contract_id": int(contract_id),
                        "parent_contract_id": int(parent.contract_id),
                    },
                )

            # Parent powinien być root primary
            if not parent.is_primary:
                raise ValidationError(
                    message=f"Addon subscription {s.id} wskazuje parent, który nie jest primary.",
                    details={
                        "subscription_id": int(s.id),
                        "parent_subscription_id": int(s.parent_subscription_id),
                        "contract_id": int(contract_id),
                    },
                )

            if parent.parent_subscription_id is not None:
                raise ValidationError(
                    message=f"Addon subscription {s.id} wskazuje parent, który sam jest addonem (parent_subscription_id != NULL).",
                    details={
                        "subscription_id": int(s.id),
                        "parent_subscription_id": int(s.parent_subscription_id),
                        "contract_id": int(contract_id),
                    },
                )

        # B) walidacja wymagań katalogowych dla root primary
        root_primary = [s for s in subs if s.is_primary and s.parent_subscription_id is None and s.product_code]

        for primary in root_primary:
            primary_product = self._catalog.get_product_by_code(primary.product_code)
            if not primary_product:
                # brak produktu w katalogu -> to jest błąd danych, ale lepiej komunikat domenowy
                raise ValidationError(
                    message=f"Brak produktu w katalogu dla product_code={primary.product_code} (subscription {primary.id}).",
                    details={
                        "subscription_id": int(primary.id),
                        "product_code": str(primary.product_code),
                        "contract_id": int(contract_id),
                    },
                )

            req_rows = self._reqs.list_for_primary_product(int(primary_product.id))
            if not req_rows:
                continue

            # dzieci tej primary
            children = [s for s in subs if s.parent_subscription_id == primary.id]

            # policz qty per required_product_id
            qty_by_required_id: dict[int, int] = {}
            for ch in children:
                if not ch.product_code:
                    continue
                p = self._catalog.get_product_by_code(ch.product_code)
                if not p:
                    continue
                qty_by_required_id[int(p.id)] = qty_by_required_id.get(int(p.id), 0) + int(ch.quantity or 0)

            violations: list[RequirementViolation] = []
            for r in req_rows:
                found = qty_by_required_id.get(int(r.required_product_id), 0)
                min_qty = int(r.min_qty or 0)
                max_qty = int(r.max_qty) if r.max_qty is not None else None

                # min_qty=0 -> opcjonalne; nadal można mieć max_qty
                if found < min_qty:
                    required_product = self._db.get(CatalogProduct, int(r.required_product_id))
                    req_code = getattr(required_product, "code", str(r.required_product_id))
                    violations.append(
                        RequirementViolation(
                            primary_subscription_id=int(primary.id),
                            required_product_code=str(req_code),
                            min_qty=min_qty,
                            found_qty=found,
                            is_hard_required=bool(r.is_hard_required),
                        )
                    )

                if max_qty is not None and found > max_qty:
                    required_product = self._db.get(CatalogProduct, int(r.required_product_id))
                    req_code = getattr(required_product, "code", str(r.required_product_id))
                    raise ValidationError(
                        message=(
                            f"Dla primary subscription {primary.id} ilość dodatku {req_code} przekracza max_qty={max_qty} (found={found})."
                        ),
                        details={
                            "primary_subscription_id": int(primary.id),
                            "required_product_code": str(req_code),
                            "found_qty": int(found),
                            "max_qty": int(max_qty),
                            "contract_id": int(contract_id),
                        },
                    )

            hard_missing = [v for v in violations if v.is_hard_required]
            if hard_missing:
                raise ValidationError(
                    message=(
                        "Brakuje wymaganych dodatków dla głównej usługi: "
                        + ", ".join(f"{v.required_product_code} ({v.found_qty}/{v.min_qty})" for v in hard_missing)
                    ),
                    details={
                        "primary_subscription_id": int(primary.id),
                        "contract_id": int(contract_id),
                        "missing": [
                            {
                                "required_product_code": v.required_product_code,
                                "min_qty": v.min_qty,
                                "found_qty": v.found_qty,
                            }
                            for v in hard_missing
                        ],
                    },
                )
