# crm/db/models/subscriptions.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


SubscriptionTypeDb = ENUM(
    "internet",
    "tv",
    "voip",
    "addon",
    name="subscription_type",
    schema=SCHEMA,
    create_type=False,
)


SubscriptionStatusDb = ENUM(
    "pending",
    "active",
    "suspended",
    "blocked",
    "terminated",
    "archived",
    name="subscription_status",
    schema=SCHEMA,
    create_type=False,
)


SubscriptionChangeTypeDb = ENUM(
    "upgrade",
    "downgrade",
    "terminate",
    "suspend",
    "resume",
    name="subscription_change_type",
    schema=SCHEMA,
    create_type=False,
)


SubscriptionChangeStatusDb = ENUM(
    "pending",
    "applied",
    "cancelled",
    "rejected",
    name="subscription_change_status",
    schema=SCHEMA,
    create_type=False,
)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    contract_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    type: Mapped[str] = mapped_column(SubscriptionTypeDb, nullable=False, index=True)
    status: Mapped[str] = mapped_column(SubscriptionStatusDb, nullable=False, server_default=text("'pending'"), index=True)

    product_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tariff_code: Mapped[str | None] = mapped_column(String(80), nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    price_override: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    billing_period_months: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    next_billing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    service_address_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.service_addresses.id", ondelete="RESTRICT"),
        nullable=True,
    )

    provisioning: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    service_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    service_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    versions: Mapped[list["SubscriptionVersion"]] = relationship(
        back_populates="subscription",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SubscriptionVersion.version_no",
    )

    change_requests: Mapped[list["SubscriptionChangeRequest"]] = relationship(
        back_populates="subscription",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SubscriptionChangeRequest.created_at",
    )


class SubscriptionVersion(Base):
    __tablename__ = "subscription_versions"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    created_by_staff_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    subscription: Mapped[Subscription] = relationship(back_populates="versions")


class SubscriptionChangeRequest(Base):
    __tablename__ = "subscription_change_requests"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    change_type: Mapped[str] = mapped_column(SubscriptionChangeTypeDb, nullable=False, index=True)
    status: Mapped[str] = mapped_column(SubscriptionChangeStatusDb, nullable=False, server_default=text("'pending'"), index=True)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    requested_by_staff_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.staff_users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    subscription: Mapped[Subscription] = relationship(back_populates="change_requests")
