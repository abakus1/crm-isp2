from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    Numeric,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from crm.db.models.base import Base


class ServiceFamily(Base):
    __tablename__ = "service_families"
    __table_args__ = {"schema": "crm"}

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(100), nullable=False, unique=True)
    parent_id = Column(Integer, ForeignKey("crm.service_families.id", ondelete="SET NULL"))
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)

    parent = relationship("ServiceFamily", remote_side=[id])


class ContractTerm(Base):
    __tablename__ = "contract_terms"
    __table_args__ = {"schema": "crm"}

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, unique=True)
    months = Column(Integer, nullable=True)  # NULL = nieokreślony
    is_active = Column(Boolean, nullable=False, default=True)


class ServicePlan(Base):
    __tablename__ = "service_plans"
    __table_args__ = {"schema": "crm"}

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    code = Column(String(100), nullable=False, unique=True)

    family_id = Column(Integer, ForeignKey("crm.service_families.id", ondelete="RESTRICT"), nullable=False)
    contract_term_id = Column(Integer, ForeignKey("crm.contract_terms.id", ondelete="RESTRICT"), nullable=False)

    billing_catalog_product_id = Column(
        Integer,
        ForeignKey("crm.catalog_products.id", ondelete="RESTRICT"),
        nullable=False,
    )

    is_primary = Column(Boolean, nullable=False, default=False)
    is_addon = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    family = relationship("ServiceFamily")
    contract_term = relationship("ContractTerm")

    month_prices = relationship(
        "ServicePlanMonthPrice",
        cascade="all, delete-orphan",
        back_populates="service_plan",
    )

    post_term_policies = relationship(
        "ServicePlanPostTermPolicy",
        cascade="all, delete-orphan",
        back_populates="service_plan",
    )


class ServicePlanMonthPrice(Base):
    __tablename__ = "service_plan_month_prices"
    __table_args__ = (
        UniqueConstraint("service_plan_id", "month_no"),
        {"schema": "crm"},
    )

    id = Column(Integer, primary_key=True)
    service_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    month_no = Column(Integer, nullable=False)
    price_net = Column(Numeric(12, 2), nullable=False)

    service_plan = relationship("ServicePlan", back_populates="month_prices")


class ServicePlanPostTermPolicy(Base):
    __tablename__ = "service_plan_post_term_policies"
    __table_args__ = {"schema": "crm"}

    id = Column(Integer, primary_key=True)
    service_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )

    increase_mode = Column(String(20), nullable=False)  # percent / fixed
    increase_value = Column(Numeric(12, 4), nullable=False)
    recurrence_months = Column(Integer, nullable=False)
    max_years = Column(Integer, nullable=False, default=10)

    service_plan = relationship("ServicePlan", back_populates="post_term_policies")


class ServicePlanRequirement(Base):
    __tablename__ = "service_plan_requirements"
    __table_args__ = (
        UniqueConstraint("service_plan_id", "required_plan_id"),
        {"schema": "crm"},
    )

    id = Column(Integer, primary_key=True)
    service_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    required_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )


class ServicePlanDependency(Base):
    __tablename__ = "service_plan_dependencies"
    __table_args__ = (
        UniqueConstraint("service_plan_id", "depends_on_plan_id"),
        {"schema": "crm"},
    )

    id = Column(Integer, primary_key=True)
    service_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    depends_on_plan_id = Column(
        Integer,
        ForeignKey("crm.service_plans.id", ondelete="CASCADE"),
        nullable=False,
    )