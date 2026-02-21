from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from crm.db.models.staff import ActivityLog, StaffUser


class StaffActivityError(Exception):
    pass


@dataclass(frozen=True)
class ActivityCursor:
    occurred_at: datetime
    id: int


def _encode_cursor(c: ActivityCursor) -> str:
    raw = f"{c.occurred_at.isoformat()}|{c.id}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _decode_cursor(cursor: str) -> Optional[ActivityCursor]:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("utf-8")).decode("utf-8")
        ts_s, id_s = raw.split("|", 1)
        return ActivityCursor(occurred_at=datetime.fromisoformat(ts_s), id=int(id_s))
    except Exception:
        return None


def list_staff_activity(
    db: Session,
    *,
    staff_id: int,
    limit: int = 20,
    cursor: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    q: Optional[str] = None,
    action: Optional[str] = None,
) -> Dict[str, Any]:
    """Returns keyset-paginated activity list for a single staff user.

    Ordering: newest -> oldest.
    Cursor points to the last returned row.
    """
    if limit < 1:
        limit = 1
    if limit > 100:
        limit = 100

    cur = _decode_cursor(cursor or "")

    qry = (
        db.query(ActivityLog, StaffUser.username)
        .outerjoin(StaffUser, StaffUser.id == ActivityLog.staff_user_id)
        .filter(ActivityLog.staff_user_id == staff_id)
    )

    if date_from is not None:
        qry = qry.filter(ActivityLog.occurred_at >= date_from)
    if date_to is not None:
        qry = qry.filter(ActivityLog.occurred_at <= date_to)

    if action:
        qry = qry.filter(ActivityLog.action == action)

    if q:
        qq = f"%{q}%"
        qry = qry.filter(
            or_(
                ActivityLog.action.ilike(qq),
                ActivityLog.message.ilike(qq),
                ActivityLog.entity_type.ilike(qq),
                ActivityLog.entity_id.ilike(qq),
            )
        )

    if cur is not None:
        qry = qry.filter(
            or_(
                ActivityLog.occurred_at < cur.occurred_at,
                and_(ActivityLog.occurred_at == cur.occurred_at, ActivityLog.id < cur.id),
            )
        )

    rows = (
        qry.order_by(ActivityLog.occurred_at.desc(), ActivityLog.id.desc())
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit
    rows = rows[:limit]

    items: List[Dict[str, Any]] = []
    next_cursor: Optional[str] = None

    for log, username in rows:
        meta = log.meta or {}
        ip = None
        # We store IP in meta; support both keys (backward/forward)
        if isinstance(meta, dict):
            ip = meta.get("ip") or meta.get("actor_ip")

        items.append(
            {
                "id": int(log.id),
                "occurred_at": log.occurred_at,
                "username": username,
                "ip": ip,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "message": log.message,
                "meta": meta,
            }
        )

    if rows:
        last = rows[-1][0]
        next_cursor = _encode_cursor(ActivityCursor(occurred_at=last.occurred_at, id=int(last.id))) if has_more else None

    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": limit,
    }
