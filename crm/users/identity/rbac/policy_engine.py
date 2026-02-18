# crm/policies/rbac/policy_engine.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from crm.users.identity.rbac.actions import Action
from crm.users.services.rbac.permission_service import is_action_allowed


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reason: str


def authorize(
    *,
    db: Session,
    staff_user_id: int,
    role: str,
    action: Action,
    bootstrap_mode: bool,
    setup_mode: bool,
    resource: Optional[dict] = None,
) -> Decision:
    # 1) bootstrap/setup “tryby specjalne” – nie mieszamy tu RBAC, bo to jest flow bezpieczeństwa
    if bootstrap_mode and action not in {Action.IDENTITY_BOOTSTRAP, Action.IDENTITY_LOGIN}:
        return Decision(False, "bootstrap_mode: dostęp tylko do identity/bootstrap")

    if setup_mode:
        allowed_setup = {
            Action.IDENTITY_SETUP_PASSWORD,
            Action.IDENTITY_SETUP_TOTP,
            Action.SYSTEM_WHOAMI_READ,
            Action.SYSTEM_HEALTH_READ,
        }
        if action not in allowed_setup:
            return Decision(False, "setup_mode: wymagane ustawienie hasła/TOTP")

    # 2) RBAC z DB (role -> actions) + override per pracownik (allow/deny)
    allowed = is_action_allowed(
        db,
        staff_user_id=staff_user_id,
        role_code=role,
        action_code=str(action.value),
    )
    if allowed:
        return Decision(True, "ok")

    return Decision(False, f"brak uprawnienia: {action.value}")
