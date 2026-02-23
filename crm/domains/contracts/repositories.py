from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Any, Optional

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from crm.db.models.contracts import Contract, ContractVersion


class ContractRepoError(RuntimeError):
    pass


class ContractRepository:
    """Twardy repo dla contracts.

    Cel: proste, testowalne operacje DB bez logiki biznesowej.
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get(self, contract_id: int) -> Contract | None:
        return self._db.get(Contract, contract_id)

    def get_by_no(self, contract_no: str) -> Contract | None:
        stmt = sa.select(Contract).where(Contract.contract_no == contract_no)
        return self._db.execute(stmt).scalars().first()

    def list_for_subscriber(self, subscriber_id: int, *, limit: int = 50, offset: int = 0) -> list[Contract]:
        stmt = (
            sa.select(Contract)
            .where(Contract.subscriber_id == subscriber_id)
            .order_by(Contract.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(self._db.execute(stmt).scalars().all())

    def create(self, *, subscriber_id: int, contract_no: str, billing_day: int = 1) -> Contract:
        obj = Contract(subscriber_id=subscriber_id, contract_no=contract_no, billing_day=billing_day)
        self._db.add(obj)
        try:
            self._db.flush()
        except IntegrityError as e:
            raise ContractRepoError(f"Contract create failed: {e}") from e
        return obj

    def add_version(
        self,
        *,
        contract_id: int,
        version_no: int,
        snapshot: dict[str, Any],
        created_by_staff_id: Optional[int] = None,
    ) -> ContractVersion:
        v = ContractVersion(
            contract_id=contract_id,
            version_no=version_no,
            snapshot=snapshot,
            created_by_staff_id=created_by_staff_id,
        )
        self._db.add(v)
        self._db.flush()
        return v

    def bump_updated_at(self, contract_id: int, *, at: datetime) -> None:
        self._db.execute(
            sa.update(Contract).where(Contract.id == contract_id).values(updated_at=at)
        )
