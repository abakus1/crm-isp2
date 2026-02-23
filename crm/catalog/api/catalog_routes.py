# crm/catalog/api/catalog_routes.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from crm.catalog.schemas import (
    CatalogProductOut,
    CatalogRequirementCreateIn,
    CatalogRequirementOut,
    CatalogRequirementUpdateIn,
)
from crm.core.audit.activity_context import set_activity_entity
from crm.db.models.pricing import CatalogProduct, CatalogProductRequirement
from crm.db.models.staff import AuditLog, StaffUser
from crm.db.session import get_db
from crm.shared.request_context import get_request_context
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require


router = APIRouter(prefix="/catalog", tags=["catalog"])


def _audit(
    *,
    db: Session,
    actor_staff_id: int,
    action: str,
    entity_type: str,
    entity_id: str,
    before: dict | None,
    after: dict | None,
    meta: dict | None = None,
    severity: str = "critical",
) -> None:
    ctx = get_request_context()
    db.add(
        AuditLog(
            staff_user_id=int(actor_staff_id),
            severity=severity,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            request_id=ctx.request_id,
            ip=ctx.ip,
            user_agent=ctx.user_agent,
            before=before,
            after=after,
            meta=meta,
        )
    )


def _product_out(p: CatalogProduct) -> CatalogProductOut:
    return CatalogProductOut(
        id=int(p.id),
        code=str(p.code),
        type=str(p.type),
        name=str(p.name),
        is_active=bool(p.is_active),
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _req_out(r: CatalogProductRequirement, *, primary: CatalogProduct | None = None, required: CatalogProduct | None = None) -> CatalogRequirementOut:
    return CatalogRequirementOut(
        id=int(r.id),
        primary_product_id=int(r.primary_product_id),
        required_product_id=int(r.required_product_id),
        min_qty=int(r.min_qty or 0),
        max_qty=int(r.max_qty) if r.max_qty is not None else None,
        is_hard_required=bool(r.is_hard_required),
        created_at=r.created_at,
        updated_at=r.updated_at,
        primary_product_code=getattr(primary, "code", None),
        required_product_code=getattr(required, "code", None),
    )


@router.get("/products", response_model=list[CatalogProductOut])
def catalog_products_list(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.CATALOG_PRODUCTS_READ)),
):
    stmt = select(CatalogProduct).order_by(CatalogProduct.type.asc(), CatalogProduct.code.asc())
    if not include_inactive:
        stmt = stmt.where(CatalogProduct.is_active.is_(True))
    rows = list(db.execute(stmt).scalars().all())
    return [_product_out(p) for p in rows]


@router.get("/requirements", response_model=list[CatalogRequirementOut])
def catalog_requirements_list(
    primary_product_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    _me: StaffUser = Depends(require(Action.CATALOG_REQUIREMENTS_READ)),
):
    primary = db.get(CatalogProduct, int(primary_product_id))
    if not primary:
        raise HTTPException(status_code=404, detail="Primary product nie istnieje")

    stmt = (
        select(CatalogProductRequirement)
        .where(CatalogProductRequirement.primary_product_id == int(primary_product_id))
        .order_by(CatalogProductRequirement.id.asc())
    )
    reqs = list(db.execute(stmt).scalars().all())

    # join produkty do UI
    prod_ids = {int(primary_product_id)} | {int(r.required_product_id) for r in reqs}
    prod_map = {int(p.id): p for p in db.execute(select(CatalogProduct).where(CatalogProduct.id.in_(list(prod_ids)))).scalars().all()}

    out: list[CatalogRequirementOut] = []
    for r in reqs:
        out.append(_req_out(r, primary=prod_map.get(int(r.primary_product_id)), required=prod_map.get(int(r.required_product_id))))
    return out


@router.post("/requirements", response_model=CatalogRequirementOut)
def catalog_requirements_create(
    payload: CatalogRequirementCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CATALOG_REQUIREMENTS_WRITE)),
):
    if int(payload.primary_product_id) == int(payload.required_product_id):
        raise HTTPException(status_code=400, detail="primary_product_id i required_product_id nie mogą być takie same")

    primary = db.get(CatalogProduct, int(payload.primary_product_id))
    required = db.get(CatalogProduct, int(payload.required_product_id))
    if not primary or not required:
        raise HTTPException(status_code=404, detail="Nie znaleziono produktu primary lub required")

    if str(primary.type) == "addon":
        raise HTTPException(status_code=400, detail="Primary product nie może być typu addon")
    if str(required.type) != "addon":
        raise HTTPException(status_code=400, detail="Required product musi być typu addon")

    if payload.max_qty is not None and payload.max_qty < payload.min_qty:
        raise HTTPException(status_code=400, detail="max_qty nie może być < min_qty")

    obj = CatalogProductRequirement(
        primary_product_id=int(payload.primary_product_id),
        required_product_id=int(payload.required_product_id),
        min_qty=int(payload.min_qty),
        max_qty=int(payload.max_qty) if payload.max_qty is not None else None,
        is_hard_required=bool(payload.is_hard_required),
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Nie można dodać zależności (duplikat lub błąd integralności)") from e

    set_activity_entity(request, entity_type="catalog_product_requirement", entity_id=str(obj.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CATALOG_REQUIREMENT_CREATE",
        entity_type="catalog_product_requirements",
        entity_id=str(obj.id),
        before=None,
        after={
            "primary_product_id": int(obj.primary_product_id),
            "required_product_id": int(obj.required_product_id),
            "min_qty": int(obj.min_qty),
            "max_qty": int(obj.max_qty) if obj.max_qty is not None else None,
            "is_hard_required": bool(obj.is_hard_required),
        },
        meta={"primary_code": str(primary.code), "required_code": str(required.code)},
        severity="critical",
    )
    db.commit()
    return _req_out(obj, primary=primary, required=required)


@router.put("/requirements/{requirement_id}", response_model=CatalogRequirementOut)
def catalog_requirements_update(
    requirement_id: int,
    payload: CatalogRequirementUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CATALOG_REQUIREMENTS_WRITE)),
):
    obj = db.get(CatalogProductRequirement, int(requirement_id))
    if not obj:
        raise HTTPException(status_code=404, detail="Requirement nie istnieje")

    if payload.max_qty is not None and payload.max_qty < payload.min_qty:
        raise HTTPException(status_code=400, detail="max_qty nie może być < min_qty")

    before = {
        "min_qty": int(obj.min_qty),
        "max_qty": int(obj.max_qty) if obj.max_qty is not None else None,
        "is_hard_required": bool(obj.is_hard_required),
    }

    obj.min_qty = int(payload.min_qty)
    obj.max_qty = int(payload.max_qty) if payload.max_qty is not None else None
    obj.is_hard_required = bool(payload.is_hard_required)
    db.flush()

    primary = db.get(CatalogProduct, int(obj.primary_product_id))
    required = db.get(CatalogProduct, int(obj.required_product_id))

    set_activity_entity(request, entity_type="catalog_product_requirement", entity_id=str(obj.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CATALOG_REQUIREMENT_UPDATE",
        entity_type="catalog_product_requirements",
        entity_id=str(obj.id),
        before=before,
        after={
            "min_qty": int(obj.min_qty),
            "max_qty": int(obj.max_qty) if obj.max_qty is not None else None,
            "is_hard_required": bool(obj.is_hard_required),
        },
        meta={
            "primary_code": getattr(primary, "code", None),
            "required_code": getattr(required, "code", None),
        },
        severity="critical",
    )
    db.commit()
    return _req_out(obj, primary=primary, required=required)


@router.delete("/requirements/{requirement_id}")
def catalog_requirements_delete(
    requirement_id: int,
    request: Request,
    db: Session = Depends(get_db),
    me: StaffUser = Depends(require(Action.CATALOG_REQUIREMENTS_WRITE)),
):
    obj = db.get(CatalogProductRequirement, int(requirement_id))
    if not obj:
        raise HTTPException(status_code=404, detail="Requirement nie istnieje")

    primary = db.get(CatalogProduct, int(obj.primary_product_id))
    required = db.get(CatalogProduct, int(obj.required_product_id))

    before = {
        "primary_product_id": int(obj.primary_product_id),
        "required_product_id": int(obj.required_product_id),
        "min_qty": int(obj.min_qty),
        "max_qty": int(obj.max_qty) if obj.max_qty is not None else None,
        "is_hard_required": bool(obj.is_hard_required),
    }

    set_activity_entity(request, entity_type="catalog_product_requirement", entity_id=str(obj.id))
    _audit(
        db=db,
        actor_staff_id=int(me.id),
        action="CATALOG_REQUIREMENT_DELETE",
        entity_type="catalog_product_requirements",
        entity_id=str(obj.id),
        before=before,
        after=None,
        meta={"primary_code": getattr(primary, "code", None), "required_code": getattr(required, "code", None)},
        severity="critical",
    )

    db.delete(obj)
    db.commit()
    return {"status": "ok"}
