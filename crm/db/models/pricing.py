# crm/db/models/pricing.py
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column, relationship

from crm.db.models.base import Base


SCHEMA = Base.metadata.schema or "crm"


# NOTE:
# DB schema for catalog/pricing is defined in alembic revision c53ec804a23c
# (pricing_schedule_foundation). Keep ORM in sync with that migration.
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
    """Katalog produktów.

    Zgodnie z DB (c53ec804a23c):
      - id: int (autoincrement)
      - code: str
      - name: str
      - product_type: ENUM
      - is_active
      - created_at/updated_at

    Uwaga: NIE używamy pola "type" w DB (to była pomyłka); jest "product_type".
    """

    __tablename__ = "catalog_products"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)

    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    product_type: Mapped[str] = mapped_column(CatalogProductTypeDb, nullable=False, index=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    price_events: Mapped[list["CatalogPriceScheduleEvent"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="CatalogPriceScheduleEvent.effective_month",
    )


class CatalogPriceScheduleEvent(Base):
    """Zdarzenie ceny w katalogu od wskazanego miesiąca (pierwszy dzień miesiąca).

    Zgodnie z DB (c53ec804a23c):
      - catalog_product_id
      - effective_month
      - monthly_price
      - activation_fee
      - source
      - note
      - created_at

    (bez VAT/currency/meta/updated_at).
    """

    __tablename__ = "catalog_price_schedule_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)

    catalog_product_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey(f"{SCHEMA}.catalog_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    effective_month: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    monthly_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    activation_fee: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    source: Mapped[str] = mapped_column(
        PriceScheduleSourceDb,
        nullable=False,
        server_default=text("'catalog'"),
    )

    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))

    product: Mapped[CatalogProduct] = relationship(back_populates="price_events")


class SubscriptionPriceScheduleEvent(Base):
    """Snapshot harmonogramu cen per subskrypcja.

    To jest jedyne źródło ceny dla billing engine.

    (Ta tabela jest w tej samej migracji, ale model może być rozwijany dalej.)
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

    monthly_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    activation_fee: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))


class CatalogProductRequirement(Base):
    """Zależności katalogowe: primary produkt wymaga (lub opcjonalnie dopuszcza) dodatki."""

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
