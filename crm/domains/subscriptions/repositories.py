from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from crm.db.models.subscriptions import Subscription, SubscriptionChangeRequest, SubscriptionVersion


class SubscriptionRepoError(RuntimeError):
    pass


class SubscriptionRepository:
    """Repo dla subscriptions + change requests.

    Zero logiki biznesowej: tylko operacje zapisu/odczytu.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, subscription_id: int) -> Subscription | None:
        return self._db.get(Subscription, subscription_id)

    def list_for_contract(self, contract_id: int, *, limit: int = 200, offset: int = 0) -> list[Subscription]:
        stmt = (
            sa.select(Subscription)
            .where(Subscription.contract_id == contract_id)
            .order_by(Subscription.id.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._db.execute(stmt).scalars().all())

    def create(
        self,
        *,
        contract_id: int,
        type: str,
        product_code: Optional[str] = None,
        tariff_code: Optional[str] = None,
        quantity: int = 1,
        billing_period_months: int = 1,
        service_address_id: Optional[int] = None,
        provisioning: Optional[dict[str, Any]] = None,
    ) -> Subscription:
        obj = Subscription(
            contract_id=contract_id,
            type=type,
            product_code=product_code,
            tariff_code=tariff_code,
            quantity=quantity,
            billing_period_months=billing_period_months,
            service_address_id=service_address_id,
            provisioning=provisioning,
        )
        self._db.add(obj)
        try:
            self._db.flush()
        except IntegrityError as e:
            raise SubscriptionRepoError(f"Subscription create failed: {e}") from e
        return obj

    def add_version(
        self,
        *,
        subscription_id: int,
        version_no: int,
        snapshot: dict[str, Any],
        created_by_staff_id: Optional[int] = None,
    ) -> SubscriptionVersion:
        v = SubscriptionVersion(
            subscription_id=subscription_id,
            version_no=version_no,
            snapshot=snapshot,
            created_by_staff_id=created_by_staff_id,
        )
        self._db.add(v)
        self._db.flush()
        return v

    def create_change_request(
        self,
        *,
        subscription_id: int,
        change_type: str,
        effective_at: datetime,
        requested_by_staff_id: Optional[int] = None,
        reason: Optional[str] = None,
        payload: Optional[dict[str, Any]] = None,
    ) -> SubscriptionChangeRequest:
        req = SubscriptionChangeRequest(
            subscription_id=subscription_id,
            change_type=change_type,
            effective_at=effective_at,
            requested_by_staff_id=requested_by_staff_id,
            reason=reason,
            payload=payload,
        )
        self._db.add(req)
        self._db.flush()
        return req
