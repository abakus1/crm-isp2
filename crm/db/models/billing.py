# crm/db/models/billing.py
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Identity, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


PaymentPlanItemTypeDb = ENUM(
    "recurring_monthly",
    "activation_fee",
    "prorata",
    "adjustment",
    "discount",
    name="payment_plan_item_type",
    schema=SCHEMA,
    create_type=False,
)


PaymentPlanItemStatusDb = ENUM(
    "planned",
    "invoiced",
    "cancelled",
    name="payment_plan_item_status",
    schema=SCHEMA,
    create_type=False,
)


class PaymentPlanItem(Base):
    __tablename__ = "payment_plan_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)

    contract_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    item_type: Mapped[str] = mapped_column(PaymentPlanItemTypeDb, nullable=False, index=True)
    status: Mapped[str] = mapped_column(PaymentPlanItemStatusDb, nullable=False, server_default=text("'planned'"), index=True)

    # „miesiąc fakturowania” jako pierwszy dzień miesiąca (bucket)
    billing_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # okres świadczenia/usługi (dla proraty może być część miesiąca)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'PLN'"))

    # Nazwy pól zgodne z migracją (f252a783382a)
    amount_net: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("0.00"))
    amount_gross: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    # meta do integracji księgowej później (Optima/KSeF)
    external_document_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # idempotencja generatora (unikamy duplikatów) — unikalny indeks częściowy w migracji
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


AccountAccessStatusDb = ENUM(
    "pending",
    "active",
    "disabled",
    name="account_access_status",
    schema=SCHEMA,
    create_type=False,
)


class AccountAccess(Base):
    __tablename__ = "account_access"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subscriber_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscribers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Placeholder for future client identity module (UUID).
    identity_user_id: Mapped[str | None] = mapped_column(UUID(as_uuid=True), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(AccountAccessStatusDb, nullable=False, server_default=text("'pending'"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
