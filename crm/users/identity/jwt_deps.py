# crm/services/identity/jwt_deps.py
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from crm.app.config import get_settings
from crm.db.models.staff import ActivityLog, AuditLog, StaffUser, SystemBootstrapState
from crm.db.session import get_db

settings = get_settings()
oauth2 = OAuth2PasswordBearer(tokenUrl="/identity/login")


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    username: str
    role: str
    bootstrap_mode: bool
    setup_mode: bool
    tv: int


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.auth_jwt_secret, algorithms=[settings.auth_jwt_alg])


def _log_audit(
    db: Session,
    *,
    staff_user_id: Optional[int],
    ip: Optional[str],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    before: Optional[Dict[str, Any]] = None,
    after: Optional[Dict[str, Any]] = None,
    meta: Optional[Dict[str, Any]] = None,
    request_id: Optional[str] = None,
    user_agent: Optional[str] = None,
    severity: str = "security",
) -> None:
    now = _utcnow()
    db.add(
        AuditLog(
            occurred_at=now,
            staff_user_id=staff_user_id,
            ip=ip,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            meta=meta,
            request_id=request_id,
            user_agent=user_agent,
            severity=severity,
        )
    )


def _log_activity(
    db: Session,
    *,
    staff_user_id: Optional[int],
    action: str,
    message: Optional[str],
    meta: Optional[Dict[str, Any]] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    now = _utcnow()
    db.add(
        ActivityLog(
            occurred_at=now,
            staff_user_id=staff_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
            meta=meta,
        )
    )


def get_claims(token: str = Depends(oauth2)) -> TokenClaims:
    try:
        data = _decode_token(token)
        tv = data.get("tv", data.get("token_version"))
        if tv is None:
            raise KeyError("tv")

        return TokenClaims(
            sub=str(data["sub"]),
            username=str(data.get("username", "")),
            role=str(data.get("role", "")),
            bootstrap_mode=bool(data.get("bootstrap_mode", False)),
            setup_mode=bool(data.get("setup_mode", False)),
            tv=int(tv),
        )
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy token.")


def _enforce_setup_mode_clamp(request: Request, claims: TokenClaims) -> None:
    """
    Jeśli token jest w setup_mode, to user ma bardzo ograniczony dostęp:
    tylko endpointy potrzebne do onboardingu + /whoami.
    """
    if not claims.setup_mode:
        return

    path = request.url.path

    allowed_prefixes = (
        "/identity/setup/",
    )
    allowed_exact = {
        "/identity/whoami",
    }

    if path in allowed_exact:
        return
    if any(path.startswith(p) for p in allowed_prefixes):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Konto jest w trybie setup — dokończ onboarding (hasło + TOTP).",
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    claims: TokenClaims = Depends(get_claims),
) -> StaffUser:
    actor_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    request_id = request.headers.get("x-request-id")

    try:
        staff_id = int(claims.sub)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy token.")

    user = db.get(StaffUser, staff_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy token.")

    if str(user.status) != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Konto zablokowane.")

    if int(getattr(user, "token_version", 0) or 0) != int(claims.tv):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token unieważniony.")

    # bootstrap safety-net: bootstrap token tylko gdy bootstrap_required=true i user=admin
    if claims.bootstrap_mode:
        if str(getattr(user, "role", "")) != "admin":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Nieprawidłowy token.")
        state = db.get(SystemBootstrapState, 1)
        if not state or not bool(state.bootstrap_required):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token bootstrap wygasł.")

    # setup-mode clamp
    _enforce_setup_mode_clamp(request, claims)

    setattr(user, "bootstrap_mode", bool(claims.bootstrap_mode))
    setattr(user, "setup_mode", bool(claims.setup_mode))

    # === IDLE TIMEOUT ===
    idle_minutes = int(getattr(settings, "auth_idle_timeout_minutes", 30))
    last_seen_update_seconds = int(getattr(settings, "auth_last_seen_update_seconds", 60))

    now = _utcnow()

    if user.last_seen_at is not None:
        if now - user.last_seen_at > timedelta(minutes=idle_minutes):
            _log_activity(
                db,
                staff_user_id=int(user.id),
                action="SESSION_IDLE_TIMEOUT",
                message="Sesja wygasła przez bezczynność",
                meta={"idle_minutes": idle_minutes, "ip": actor_ip},
                entity_type="staff_users",
                entity_id=str(user.id),
            )
            _log_audit(
                db,
                staff_user_id=int(user.id),
                ip=actor_ip,
                action="SESSION_IDLE_TIMEOUT",
                entity_type="staff_users",
                entity_id=str(user.id),
                before={"last_seen_at": user.last_seen_at.isoformat()},
                after={"now": now.isoformat(), "idle_minutes": idle_minutes},
                request_id=request_id,
                user_agent=user_agent,
                severity="security",
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sesja wygasła (bezczynność). Zaloguj się ponownie.",
            )

    should_update_last_seen = (
        user.last_seen_at is None
        or (now - user.last_seen_at).total_seconds() >= last_seen_update_seconds
    )
    if should_update_last_seen:
        user.last_seen_at = now
        db.commit()

    return user


def require_bootstrap_token(claims: TokenClaims = Depends(get_claims)) -> TokenClaims:
    if not claims.bootstrap_mode:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="To endpoint bootstrap-only.")
    return claims
