from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List
from urllib.parse import quote_plus
from pydantic_settings import BaseSettings


def _parse_simple_env(text: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def _read_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Env file not found: {path}")
    return _parse_simple_env(path.read_text(encoding="utf-8"))


def load_env_stack(project_root: Path | None = None) -> List[Path]:
    if project_root is None:
        project_root = Path(__file__).resolve().parents[2]

    stack_path = project_root / "env" / "stack.env"
    stack = _read_env_file(stack_path)

    env_files = stack.get("ENV_FILES", "").strip()
    if not env_files:
        raise RuntimeError("env/stack.env must define ENV_FILES=...")

    loaded: List[Path] = []
    merged: Dict[str, str] = {}

    for rel in [x.strip() for x in env_files.split(",") if x.strip()]:
        p = (project_root / rel).resolve()
        merged.update(_read_env_file(p))
        loaded.append(p)

    # Set defaults from files, but allow real environment to override
    for k, v in merged.items():
        os.environ.setdefault(k, v)

    return loaded


@dataclass(frozen=True)
class Settings:
    # --- ENV ---
    env_name: str
    log_level: str

    # --- DB ---
    db_host: str
    db_port: int
    db_name: str
    db_schema: str
    db_user: str
    db_password: str

    # --- AUTH / SECURITY ---
    auth_jwt_secret: str
    auth_jwt_alg: str
    auth_access_token_minutes: int
    auth_totp_issuer: str

    # ---- AUTH HARDENING / THROTTLE ----
    auth_throttle_window_seconds: int

    auth_lockout_threshold_user: int
    auth_lockout_base_seconds_user: int
    auth_lockout_max_seconds_user: int

    auth_lockout_threshold_ip: int
    auth_lockout_base_seconds_ip: int
    auth_lockout_max_seconds_ip: int

    # ---- AUTH HARDENING / IP ALLOWLIST ----
    auth_ip_allowlist_enabled: bool
    auth_allowed_ips: str

    # --- PASSWORD POLICY ---
    auth_password_max_age_days: int

    # --- SMTP / MAIL ---
    smtp_enabled: bool
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    smtp_from: str
    smtp_starttls: bool

    # --- PRG (referencyjna baza adresów) ---
    prg_import_dir: str
    prg_auto_reconcile: bool
    prg_reconcile_distance_m: float
    prg_delete_file_after_import: bool

    security_allowlist_ips: str = ""

    @property
    def database_url(self) -> str:
        pwd = quote_plus(self.db_password)
        return (
            f"postgresql+psycopg://"
            f"{self.db_user}:{pwd}@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def db_dsn(self) -> str:
        return self.database_url


_settings_cache: dict[str, Settings] = {}


def _is_truthy(v: str) -> bool:
    return v.strip().lower() in ("1", "true", "yes", "on")


def get_settings(project_root: Path | None = None) -> Settings:
    global _settings_cache

    cache_key = os.getenv("DB_ROLE", "").strip().lower() or "default"
    if cache_key in _settings_cache:
        return _settings_cache[cache_key]

    loaded = load_env_stack(project_root=project_root)

    def req(name: str) -> str:
        v = os.getenv(name, "").strip()
        if not v:
            raise RuntimeError(
                f"Missing required env var: {name} "
                f"(loaded: {[str(p) for p in loaded]})"
            )
        return v

    # --- SMTP VALIDATION (only when enabled) ---
    smtp_enabled = _is_truthy(os.getenv("SMTP_ENABLED", "0"))
    if smtp_enabled:
        req("SMTP_HOST")
        req("SMTP_FROM")

        smtp_port_raw = os.getenv("SMTP_PORT", "").strip() or "587"
        try:
            int(smtp_port_raw)
        except ValueError:
            raise RuntimeError(f"Invalid SMTP_PORT={smtp_port_raw!r} (must be int)")

        smtp_user = os.getenv("SMTP_USER", "").strip()
        if smtp_user:
            req("SMTP_PASS")

    # --- DB ROLE RESOLUTION ---
    db_role = os.getenv("DB_ROLE", "").strip().lower()

    user_admin = os.getenv("DB_USER_ADMIN", "crm_admin").strip()
    user_writer = os.getenv("DB_USER_WRITER", "crm_writer").strip()
    user_reader = os.getenv("DB_USER_READER", "crm_reader").strip()

    if db_role:
        if db_role == "admin":
            db_user = user_admin
            db_password = req("DB_PASSWORD_ADMIN")
        elif db_role == "writer":
            db_user = user_writer
            db_password = req("DB_PASSWORD_WRITER")
        elif db_role == "reader":
            db_user = user_reader
            db_password = req("DB_PASSWORD_READER")
        else:
            raise RuntimeError(f"Unknown DB_ROLE={db_role}. Expected admin/writer/reader.")
    else:
        db_user = req("DB_USER")
        db_password = req("DB_PASSWORD")

    # --- NORMALIZE SMTP FIELDS (empty when disabled) ---
    smtp_port_raw = os.getenv("SMTP_PORT", "").strip() or "587"
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError as e:
        raise RuntimeError(f"Invalid SMTP_PORT={smtp_port_raw!r} (must be int)") from e

    s = Settings(
        # --- ENV ---
        env_name=os.getenv("ENV_NAME", "dev"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),

        # --- DB ---
        db_host=req("DB_HOST"),
        db_port=int(req("DB_PORT")),
        db_name=req("DB_NAME"),
        db_schema=req("DB_SCHEMA"),
        db_user=db_user,
        db_password=db_password,

        # ---- AUTH HARDENING / IP ALLOWLIST ----
        auth_ip_allowlist_enabled=_is_truthy(os.getenv("AUTH_IP_ALLOWLIST_ENABLED", "0")),
        auth_allowed_ips=os.getenv("AUTH_ALLOWED_IPS", "").strip(),

        # --- AUTH ---
        auth_jwt_secret=req("AUTH_JWT_SECRET"),
        auth_jwt_alg=os.getenv("AUTH_JWT_ALG", "HS256"),
        auth_access_token_minutes=int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "60")),
        auth_totp_issuer=os.getenv("AUTH_TOTP_ISSUER", "CRM Gemini"),

        # ---- AUTH HARDENING / THROTTLE ----
        auth_throttle_window_seconds=int(os.getenv("AUTH_THROTTLE_WINDOW_SECONDS", "900")),

        auth_lockout_threshold_user=int(os.getenv("AUTH_LOCKOUT_THRESHOLD_USER", "5")),
        auth_lockout_base_seconds_user=int(os.getenv("AUTH_LOCKOUT_BASE_SECONDS_USER", "60")),
        auth_lockout_max_seconds_user=int(os.getenv("AUTH_LOCKOUT_MAX_SECONDS_USER", "3600")),

        auth_lockout_threshold_ip=int(os.getenv("AUTH_LOCKOUT_THRESHOLD_IP", "20")),
        auth_lockout_base_seconds_ip=int(os.getenv("AUTH_LOCKOUT_BASE_SECONDS_IP", "60")),
        auth_lockout_max_seconds_ip=int(os.getenv("AUTH_LOCKOUT_MAX_SECONDS_IP", "600")),

        # --- PASSWORD POLICY ---
        auth_password_max_age_days=int(os.getenv("AUTH_PASSWORD_MAX_AGE_DAYS", "30")),

        # --- SMTP / MAIL ---
        smtp_enabled=smtp_enabled,
        smtp_host=os.getenv("SMTP_HOST", "").strip(),
        smtp_port=smtp_port,
        smtp_user=os.getenv("SMTP_USER", "").strip(),
        smtp_pass=os.getenv("SMTP_PASS", "").strip(),
        smtp_from=os.getenv("SMTP_FROM", "").strip(),
        smtp_starttls=_is_truthy(os.getenv("SMTP_STARTTLS", "1")),

        # --- PRG ---
        prg_import_dir=os.getenv("PRG_IMPORT_DIR", "var/prg/imports").strip() or "var/prg/imports",
        prg_auto_reconcile=_is_truthy(os.getenv("PRG_AUTO_RECONCILE", "1")),
        prg_reconcile_distance_m=float(os.getenv("PRG_RECONCILE_DISTANCE_M", "50")),
        prg_delete_file_after_import=_is_truthy(os.getenv("PRG_DELETE_FILE_AFTER_IMPORT", "1")),
    )

    _settings_cache[cache_key] = s
    return s
