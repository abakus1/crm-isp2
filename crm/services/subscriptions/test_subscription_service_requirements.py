import unittest

from crm.shared.errors import ValidationError
from crm.services.subscriptions.subscription_service import SubscriptionService


class _FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return self._values


class _FakeExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakeSession:
    def __init__(self, required_ids):
        self._required_ids = required_ids

    def execute(self, stmt):
        # stmt jest selectem, nie parsujemy — w testach chodzi o logikę różnicy zbiorów
        return _FakeExecuteResult(self._required_ids)


class ValidatePlanRequirementsTests(unittest.TestCase):
    def test_ok_when_no_requirements(self):
        db = _FakeSession(required_ids=[])
        svc = SubscriptionService(db)  # type: ignore[arg-type]
        svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[])

    def test_ok_when_all_required_selected(self):
        db = _FakeSession(required_ids=[10, 20])
        svc = SubscriptionService(db)  # type: ignore[arg-type]
        svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[20, 10])

    def test_raises_when_missing_required(self):
        db = _FakeSession(required_ids=[10, 20, 30])
        svc = SubscriptionService(db)  # type: ignore[arg-type]
        with self.assertRaises(ValidationError) as ctx:
            svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[10])
        self.assertIn("missing_required_plan_ids", ctx.exception.details)
        self.assertEqual(ctx.exception.details["missing_required_plan_ids"], [20, 30])


if __name__ == "__main__":
    unittest.main()