from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from fastapi import Request


@dataclass(frozen=True)
class ActivityEntity:
    entity_type: str
    entity_id: str


def set_activity_entity(request: Request, *, entity_type: str, entity_id: str) -> None:
    """Attach entity context to request (used by activity middleware)."""
    request.state.activity_entity_type = str(entity_type)
    request.state.activity_entity_id = str(entity_id)


def get_activity_entity(request: Request) -> Tuple[Optional[str], Optional[str]]:
    et = getattr(request.state, "activity_entity_type", None)
    eid = getattr(request.state, "activity_entity_id", None)
    return (str(et) if et else None, str(eid) if eid else None)


def _path_segments(request: Request) -> list[str]:
    path = (request.url.path or "/").strip("/")
    if not path:
        return []
    return [seg for seg in path.split("/") if seg]


def extract_entity_from_request(request: Request) -> Tuple[Optional[str], Optional[str]]:
    """Best-effort entity extractor.

    Priority:
    1) explicit request.state.activity_entity_*
    2) path heuristics for known modules (staff, prg)

    This is intentionally conservative. If we cannot be sure, we return (None, None).
    """
    et, eid = get_activity_entity(request)
    if et and eid:
        return et, eid

    segs = _path_segments(request)
    if not segs:
        return None, None

    # --- STAFF ---
    # /staff/{id}, /staff/{id}/disable, /staff/{id}/enable, /staff/{id}/archive, ...
    if segs[0] == "staff" and len(segs) >= 2:
        maybe_id = segs[1]
        if maybe_id.isdigit():
            return "staff_user", maybe_id

    # --- PRG ---
    # /prg/jobs/{job_id}/cancel
    if segs[0] == "prg":
        if len(segs) >= 3 and segs[1] == "jobs":
            maybe_job_id = segs[2]
            if maybe_job_id.isdigit():
                return "prg_job", maybe_job_id

        # /prg/local-points/{id}
        if len(segs) >= 3 and segs[1] in ("local-points", "local_points"):
            maybe_id = segs[2]
            if maybe_id.isdigit():
                return "prg_address_point", maybe_id

        # /prg/address-points/{id} (if you expose it)
        if len(segs) >= 3 and segs[1] in ("address-points", "address_points"):
            maybe_id = segs[2]
            if maybe_id.isdigit():
                return "prg_address_point", maybe_id

    return None, None
