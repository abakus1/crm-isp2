# crm/users/identity/auth_service.py
"""Identity auth service (facade).

This file used to contain the whole implementation (~1100 lines). It now re-exports
the same public API from smaller modules, keeping backward compatibility for
imports across the codebase.
"""

from __future__ import annotations

# Public primitives (kept stable)
from crm.users.identity.auth_common import AuthError, AuthResult, _pwd  # noqa: F401

# Public functions (kept stable)
from crm.users.identity.auth_login import authenticate_login  # noqa: F401
from crm.users.identity.auth_bootstrap import (  # noqa: F401
    bootstrap_begin,
    bootstrap_complete,
    bootstrap_confirm,
    bootstrap_confirm_totp,
)
from crm.users.identity.auth_setup import (  # noqa: F401
    setup_change_password,
    setup_enable_totp,
    setup_totp_begin,
)
from crm.users.identity.auth_self_service import (  # noqa: F401
    self_change_password,
    self_totp_reset_begin,
    self_totp_reset_confirm,
    self_update_email,
)

# NOTE: internal helpers were intentionally moved to auth_common.py.