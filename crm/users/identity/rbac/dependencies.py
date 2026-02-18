# crm/policies/rbac/dependencies.py
from __future__ import annotations

from typing import Callable, Optional

from fastapi import Depends, HTTPException, status, Request

from crm.db.models.staff import StaffUser
from crm.db.session import get_db
from sqlalchemy.orm import Session
from crm.users.identity.rbac.actions import Action
from crm.users.identity.rbac.policy_engine import authorize
from crm.users.identity.jwt_deps import get_claims, get_current_user, TokenClaims


def require(action: Action, *, resource: Optional[dict] = None) -> Callable[..., StaffUser]:
    """
    FastAPI dependency: require(Action.X)
    Po KROK 17: kill-switch (DB) -> RBAC.
    """

    def _dep(
        user: StaffUser = Depends(get_current_user),
        claims: TokenClaims = Depends(get_claims),
        db: Session = Depends(get_db),
        request: Request = None,
    ) -> StaffUser:
        decision = authorize(
            db=db,
            staff_user_id=int(user.id),
            role=str(user.role),
            action=action,
            bootstrap_mode=bool(claims.bootstrap_mode),
            setup_mode=bool(getattr(claims, "setup_mode", False)),
            resource=resource,
        )
        if not decision.allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=decision.reason,
            )
        return user

    return _dep
