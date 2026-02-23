# crm/db/models/billing.py
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Identity, Numeric, String, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
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

    billing_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)

    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'PLN'"))
    net_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("23.00"))
    gross_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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

    # Placeholder for future client identity module.
    identity_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(AccountAccessStatusDb, nullable=False, server_default=text("'pending'"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
