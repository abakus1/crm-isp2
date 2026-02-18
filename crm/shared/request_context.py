from __future__ import annotations

from dataclasses import dataclass
from contextvars import ContextVar
from typing import Optional


@dataclass(frozen=True)
class RequestContext:
    request_id: Optional[str]
    ip: Optional[str]
    user_agent: Optional[str]


_request_ctx: ContextVar[RequestContext] = ContextVar(
    "request_context",
    default=RequestContext(request_id=None, ip=None, user_agent=None),
)


def set_request_context(*, request_id: str | None, ip: str | None, user_agent: str | None) -> None:
    _request_ctx.set(RequestContext(request_id=request_id, ip=ip, user_agent=user_agent))


def get_request_context() -> RequestContext:
    return _request_ctx.get()