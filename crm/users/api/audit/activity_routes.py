from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from crm.db.session import get_db

from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.dependencies import require

from crm.users.services.audit.activity_admin_service import list_activity


router = APIRouter(prefix="/activity", tags=["activity"])


class ActivityItemOut(BaseModel):
    id: int
    occurred_at: datetime
    staff_user_id: Optional[int] = None
    username: Optional[str] = None
    ip: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    message: Optional[str] = None
    meta: Optional[dict] = None


class ActivityListOut(BaseModel):
    items: List[ActivityItemOut]
    next_cursor: Optional[str] = None
    has_more: bool
    limit: int


@router.get(
    "",
    response_model=ActivityListOut,
    dependencies=[Depends(require(Action.ACTIVITY_READ_ALL))],
)
def activity_list(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    q: Optional[str] = Query(None, max_length=200),
    action: Optional[str] = Query(None, max_length=120),
    staff_user_id: Optional[int] = Query(None, ge=1),
    entity_type: Optional[str] = Query(None, max_length=80),
    entity_id: Optional[str] = Query(None, max_length=80),
) -> Any:
    """Global activity feed for ADMIN / privileged staff.

    Filters:
    - staff_user_id
    - entity_type + entity_id
    - action
    - date range
    - q (ILIKE over action/message/entity fields)
    """
    return list_activity(
        db,
        limit=limit,
        cursor=cursor,
        date_from=date_from,
        date_to=date_to,
        q=q,
        action=action,
        staff_user_id=staff_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
    )
