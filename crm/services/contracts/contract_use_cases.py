from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from crm.db.models.contracts import Contract
from crm.domains.contracts.repositories import ContractRepository


class ContractUseCaseError(RuntimeError):
    pass


@dataclass(frozen=True)
class CreateContractInput:
    subscriber_id: int
    contract_no: str
    billing_day: int = 1
    is_indefinite: bool = True
    term_months: Optional[int] = None
    notice_days: Optional[int] = 30
    signed_at: Optional[datetime] = None


def create_contract(db: Session, *, data: CreateContractInput) -> Contract:
    repo = ContractRepository(db)

    existing = repo.get_by_no(data.contract_no)
    if existing:
        raise ContractUseCaseError(f"Contract {data.contract_no} already exists")

    c = repo.create(subscriber_id=data.subscriber_id, contract_no=data.contract_no, billing_day=data.billing_day)

    # ustawiamy warunki kontraktu od razu (repo tworzy minimalny rekord)
    db.execute(
        sa.update(Contract)
        .where(Contract.id == c.id)
        .values(
            is_indefinite=data.is_indefinite,
            term_months=data.term_months,
            notice_days=data.notice_days,
            signed_at=data.signed_at,
        )
    )
    db.flush()
    return repo.get(c.id) or c
