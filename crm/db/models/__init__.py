# Import models so that SQLAlchemy knows them when needed (e.g., metadata, migrations autogenerate).
# Keep this file lightweight: only imports.

from crm.db.models.billing import AccountAccess, PaymentPlanItem  # noqa: F401
from crm.db.models.contracts import Contract, ContractVersion  # noqa: F401
from crm.db.models.pricing import (  # noqa: F401
    CatalogPriceScheduleEvent,
    CatalogProduct,
    CatalogProductRequirement,
    SubscriptionPriceScheduleEvent,
)
from crm.db.models.subscriptions import (  # noqa: F401
    Subscription,
    SubscriptionChangeRequest,
    SubscriptionVersion,
)
