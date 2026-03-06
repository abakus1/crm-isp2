from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from crm.db.session import SessionLocal
from crm.sms.services import SmsQueueService, SmsQueueValidationError


def main() -> int:
    parser = argparse.ArgumentParser(description="CRM-ISP2 SMS worker for outbound queue + delivery reports")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--delivery-limit", type=int, default=50)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        service = SmsQueueService(db)
        dispatch = service.dispatch_due_batch(actor_staff_id=None, batch_size=max(1, args.batch_size))
        delivery_processed = service.process_delivery_reports(limit=max(1, args.delivery_limit), actor_staff_id=None)
        print(
            json.dumps(
                {
                    "claimed": dispatch.claimed,
                    "sent": dispatch.sent,
                    "delivered": dispatch.delivered,
                    "failed": dispatch.failed,
                    "requeued": dispatch.requeued,
                    "skipped": dispatch.skipped,
                    "delivery_reports_processed": delivery_processed,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except SmsQueueValidationError as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 2
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())