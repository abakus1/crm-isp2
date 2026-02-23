import unittest


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def all(self):
        return list(self._values)


class _FakeResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return _FakeScalarResult(self._values)


class _FakeSession:
    """Minimalny fake Session do unit testów.

    SubscriptionService.validate_plan_requirements() używa tylko:
      db.execute(stmt).scalars().all()
    """

    def __init__(self, required_plan_ids):
        self._required_plan_ids = list(required_plan_ids)

    def execute(self, _stmt):  # noqa: ANN001 - test fake
        return _FakeResult(self._required_plan_ids)


class ValidatePlanRequirementsTests(unittest.TestCase):
    def test_ok_when_all_required_addons_selected(self):
        from crm.services.subscriptions.subscription_service import SubscriptionService

        db = _FakeSession(required_plan_ids=[10, 20])
        svc = SubscriptionService(db)

        svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[20, 10])

    def test_ok_when_no_requirements(self):
        from crm.services.subscriptions.subscription_service import SubscriptionService

        db = _FakeSession(required_plan_ids=[])
        svc = SubscriptionService(db)

        svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[])

    def test_raises_when_missing_required_addons(self):
        from crm.services.subscriptions.subscription_service import SubscriptionService
        from crm.shared.errors import ValidationError

        db = _FakeSession(required_plan_ids=[10, 20])
        svc = SubscriptionService(db)

        with self.assertRaises(ValidationError) as ctx:
            svc.validate_plan_requirements(primary_plan_id=1, selected_addon_plan_ids=[10])

        err = ctx.exception
        self.assertEqual(err.code, "validation_error")
        self.assertIsNotNone(err.details)
        self.assertEqual(err.details.get("primary_plan_id"), 1)
        self.assertEqual(err.details.get("missing_required_plan_ids"), [20])


if __name__ == "__main__":
    unittest.main()