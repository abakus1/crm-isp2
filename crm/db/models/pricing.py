# crm/db/models/pricing.py
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Identity, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


CatalogProductTypeDb = ENUM(
    "internet",
    "tv",
    "voip",
    "addon",
    name="catalog_product_type",
    schema=SCHEMA,
    create_type=False,
)


PriceScheduleSourceDb = ENUM(
    "catalog",
    "contract_post_term",
    "contract_annual",
    "manual",
    name="price_schedule_source",
    schema=SCHEMA,
    create_type=False,
)


class CatalogProduct(Base):
    """Katalog produktów (źródło prawdy dla product_code).

    Uwaga: to jest minimalny fundament — nazwy/opisy/parametry techniczne dojdą później.
    """

    __tablename__ = "catalog_products"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)

    code: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    type: Mapped[str] = mapped_column(CatalogProductTypeDb, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    price_events: Mapped[list["CatalogPriceScheduleEvent"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CatalogPriceScheduleEvent.effective_month",
    )


class CatalogPriceScheduleEvent(Base):
    """Zdarzenie zmiany ceny w katalogu od wskazanego miesiąca (pierwszy dzień miesiąca)."""

    __tablename__ = "catalog_price_schedule_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)

    product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.catalog_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    effective_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    monthly_net: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("23.00"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'PLN'"))

    activation_fee_net: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    product: Mapped[CatalogProduct] = relationship(back_populates="price_events")


class SubscriptionPriceScheduleEvent(Base):
    """Snapshot harmonogramu cen per subskrypcja.

    To jest jedyne źródło ceny dla billing engine. Powstaje przy podpisaniu/aktywacji
    (albo aneksie) na bazie katalogu + polityk kontraktu.
    """

    __tablename__ = "subscription_price_schedule_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)

    subscription_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source: Mapped[str] = mapped_column(PriceScheduleSourceDb, nullable=False, index=True)

    # zawsze pierwszy dzień miesiąca
    effective_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    monthly_net: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    vat_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, server_default=text("23.00"))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'PLN'"))

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class CatalogProductRequirement(Base):
    """Zależności katalogowe: primary produkt wymaga (lub opcjonalnie dopuszcza) dodatki.

    Przykład:
      Internet -> wymaga ONT (is_hard_required=true)
      TV -> wymaga STB (is_hard_required=true)
      Internet -> może mieć Public IP (is_hard_required=false, min_qty=0)
    """

    __tablename__ = "catalog_product_requirements"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    primary_product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.catalog_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    required_product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey(f"{SCHEMA}.catalog_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    min_qty: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    max_qty: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_hard_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    primary_product: Mapped["CatalogProduct"] = relationship(
        "CatalogProduct",
        foreign_keys=[primary_product_id],
    )

    required_product: Mapped["CatalogProduct"] = relationship(
        "CatalogProduct",
        foreign_keys=[required_product_id],
    )

