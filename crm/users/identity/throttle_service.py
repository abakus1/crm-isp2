# crm/services/identity/throttle_service.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from crm.app.config import get_settings


class AuthLockedError(Exception):
    def __init__(self, locked_until: datetime, scope: str) -> None:
        super().__init__("Locked")
        self.locked_until = locked_until
        self.scope = scope  # "ip" | "user" | "ip_user"


@dataclass(frozen=True)
class ThrottleKeys:
    ip: tuple[str, str]
    user: tuple[str, str]
    ip_user: tuple[str, str]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _norm_username(username: str) -> str:
    return (username or "").strip().lower()


def build_keys(ip: str, username: str) -> ThrottleKeys:
    u = _norm_username(username)
    ip = (ip or "").strip()
    return ThrottleKeys(
        ip=("ip", ip),
        user=("user", u),
        ip_user=("ip_user", f"{ip}|{u}"),
    )


def ensure_not_locked(db: Session, ip: str, username: str) -> None:
    keys = build_keys(ip, username)
    now = _now()

    # kolejność: najpierw ip_user, potem user, potem ip (najbardziej "precyzyjne" najpierw)
    for scope, (k_type, k_val) in [
        ("ip_user", keys.ip_user),
        ("user", keys.user),
        ("ip", keys.ip),
    ]:
        if not k_val:
            continue
        row = db.execute(
            text(
                """
                SELECT locked_until
                FROM crm.auth_throttle
                WHERE key_type = :kt AND key = :k
                """
            ),
            {"kt": k_type, "k": k_val},
        ).fetchone()
        if row and row[0] and row[0] > now:
            raise AuthLockedError(row[0], scope)


def register_failure(db: Session, ip: str, username: str, *, kind: str) -> None:
    """
    kind: "bad_password" | "bad_totp" | "unknown_user" etc. (do meta w audit/activity)

    Model:
      - user / ip_user: niski próg (np. 5) -> szybko broni konto
      - ip: wysoki próg (np. 20) -> łapie spray po wielu kontach z jednego IP
    """
    s = get_settings()
    now = _now()

    # window wspólne
    window_seconds = int(getattr(s, "auth_throttle_window_seconds", 900))

    # progi
    threshold_user = int(getattr(s, "auth_lockout_threshold_user", 5))
    threshold_ip = int(getattr(s, "auth_lockout_threshold_ip", 20))

    # backoff dla user/ip_user
    base_seconds_user = int(getattr(s, "auth_lockout_base_seconds_user", 60))
    max_seconds_user = int(getattr(s, "auth_lockout_max_seconds_user", 3600))

    # backoff dla IP (zwykle krócej, żeby nie ubić biura/VPN na długo)
    base_seconds_ip = int(getattr(s, "auth_lockout_base_seconds_ip", 60))
    max_seconds_ip = int(getattr(s, "auth_lockout_max_seconds_ip", 600))

    keys = build_keys(ip, username)

    # Helper: upsert + zwróć fail_count
    def _upsert(k_type: str, k_val: str) -> int:
        row = db.execute(
            text(
                """
                INSERT INTO crm.auth_throttle
                    (key_type, key, fail_count, first_fail_at, last_fail_at, locked_until, created_at, updated_at)
                VALUES
                    (:kt, :k, 1, :now, :now, NULL, :now, :now)
                ON CONFLICT (key_type, key)
                DO UPDATE SET
                    fail_count = CASE
                        WHEN crm.auth_throttle.last_fail_at IS NULL THEN crm.auth_throttle.fail_count + 1
                        WHEN (EXTRACT(EPOCH FROM (:now - crm.auth_throttle.last_fail_at))) > :window_seconds THEN 1
                        ELSE crm.auth_throttle.fail_count + 1
                    END,
                    first_fail_at = CASE
                        WHEN crm.auth_throttle.last_fail_at IS NULL THEN :now
                        WHEN (EXTRACT(EPOCH FROM (:now - crm.auth_throttle.last_fail_at))) > :window_seconds THEN :now
                        ELSE crm.auth_throttle.first_fail_at
                    END,
                    last_fail_at = :now,
                    updated_at = :now
                RETURNING fail_count
                """
            ),
            {"kt": k_type, "k": k_val, "now": now, "window_seconds": window_seconds},
        ).fetchone()
        return int(row[0]) if row else 1

    def _lock(k_type: str, k_val: str, *, fail_count: int, threshold: int, base_seconds: int, max_seconds: int) -> None:
        if fail_count < threshold:
            return
        exp = max(0, fail_count - threshold)
        lock_seconds = min(max_seconds, base_seconds * (2**exp))
        locked_until = now + timedelta(seconds=lock_seconds)
        db.execute(
            text(
                """
                UPDATE crm.auth_throttle
                SET locked_until = :locked_until,
                    updated_at = :now
                WHERE key_type = :kt AND key = :k
                """
            ),
            {"locked_until": locked_until, "now": now, "kt": k_type, "k": k_val},
        )

    # 1) ip_user + user -> szybka ochrona konta
    for k_type, k_val in [keys.ip_user, keys.user]:
        if not k_val:
            continue
        fc = _upsert(k_type, k_val)
        _lock(
            k_type,
            k_val,
            fail_count=fc,
            threshold=threshold_user,
            base_seconds=base_seconds_user,
            max_seconds=max_seconds_user,
        )

    # 2) ip -> wolniejsza ochrona na spray
    k_type, k_val = keys.ip
    if k_val:
        fc = _upsert(k_type, k_val)
        _lock(
            k_type,
            k_val,
            fail_count=fc,
            threshold=threshold_ip,
            base_seconds=base_seconds_ip,
            max_seconds=max_seconds_ip,
        )


def reset_success(db: Session, ip: str, username: str) -> None:
    keys = build_keys(ip, username)
    # Po sukcesie czyścimy user + ip_user (IP można zostawić jako "globalny" limiter)
    for k_type, k_val in [keys.ip_user, keys.user]:
        if not k_val:
            continue
        db.execute(
            text("DELETE FROM crm.auth_throttle WHERE key_type = :kt AND key = :k"),
            {"kt": k_type, "k": k_val},
        )
