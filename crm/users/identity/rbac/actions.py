# crm/policies/rbac/actions.py
from __future__ import annotations
from enum import Enum

class Action(str, Enum):
    # System / meta
    SYSTEM_HEALTH_READ = "system.health.read"
    SYSTEM_WHOAMI_READ = "system.whoami.read"

    # Identity
    IDENTITY_LOGIN = "identity.login"
    IDENTITY_BOOTSTRAP = "identity.bootstrap"
    IDENTITY_SETUP_PASSWORD = "identity.setup.password"
    IDENTITY_SETUP_TOTP = "identity.setup.totp"
    IDENTITY_SELF_PASSWORD_CHANGE = "identity.self.password.change"
    IDENTITY_SELF_TOTP_RESET_BEGIN = "identity.self.totp.reset.begin"
    IDENTITY_SELF_TOTP_RESET_CONFIRM = "identity.self.totp.reset.confirm"
    IDENTITY_SELF_EMAIL_UPDATE = "identity.self.email.update"

    # Audit / activity
    AUDIT_READ_ALL = "audit.read_all"
    ACTIVITY_READ_ALL = "activity.read_all"

    RBAC_ADMIN_PING = "rbac.admin_ping"

    # Staff lifecycle + IAM
    STAFF_LIST = "staff.list"
    STAFF_READ_SELF = "staff.read.self"
    STAFF_READ = "staff.read"
    STAFF_CREATE = "staff.create"
    STAFF_DISABLE = "staff.disable"
    STAFF_ENABLE = "staff.enable"
    STAFF_ARCHIVE = "staff.archive"
    STAFF_UNARCHIVE = "staff.unarchive"
    STAFF_RESET_PASSWORD = "staff.reset_password"
    STAFF_RESET_TOTP = "staff.reset_totp"
    STAFF_PERMISSIONS_READ = "staff.permissions.read"
    STAFF_PERMISSIONS_WRITE = "staff.permissions.write"

    # Biz
    SUBSCRIBERS_READ = "subscribers.read"
    SUBSCRIBERS_WRITE = "subscribers.write"
    CONTRACTS_READ = "contracts.read"
    CONTRACTS_WRITE = "contracts.write"
    BILLING_READ = "billing.read"
    BILLING_WRITE = "billing.write"
    BILLING_EXPORT_OPTIMA = "billing.export_optima"

    # RBAC admin endpoints
    RBAC_ACTIONS_LIST = "rbac.actions.list"
    RBAC_ROLES_LIST = "rbac.roles.list"

    RBAC_ROLE_ACTIONS_READ = "rbac.role_actions.read"
    RBAC_ROLE_ACTIONS_WRITE = "rbac.role_actions.write"
