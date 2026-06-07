import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Request

# ── Config ────────────────────────────────────────────────────────────────────

# Legacy bearer token — used by hook agents; accepted on all endpoints
DASHBOARD_TOKEN = os.getenv("DASHBOARD_TOKEN", "")

# Admin credentials for dashboard login (UI)
ADMIN_USER = os.getenv("CLAUDASH_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("CLAUDASH_ADMIN_PASS", "")

# JWT secret — auto-generate per-process if not set (persistent across restarts via .env)
JWT_SECRET = os.getenv("CLAUDASH_JWT_SECRET") or secrets.token_hex(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("CLAUDASH_JWT_EXPIRE_HOURS", "24"))

# Warn on startup if using defaults
import sys
if not ADMIN_PASS and not DASHBOARD_TOKEN:
    print(
        "⚠  WARNING: No CLAUDASH_ADMIN_PASS or DASHBOARD_TOKEN set. "
        "Set at least one in your .env file.",
        file=sys.stderr,
    )


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(username: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({"sub": username, "exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ── Auth check ────────────────────────────────────────────────────────────────

def _extract_bearer(request: Request) -> str:
    """Pull raw token string from Authorization header or ?token= query param."""
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.query_params.get("token", "")


def check_auth(request: Request) -> bool:
    """Return True if the request carries a valid JWT or the legacy DASHBOARD_TOKEN."""
    token = _extract_bearer(request)
    if not token:
        return False

    # Legacy: raw static token (used by hook agents and old installs)
    if DASHBOARD_TOKEN and token == DASHBOARD_TOKEN:
        return True

    # JWT: issued by POST /api/auth/login
    if decode_token(token) is not None:
        return True

    return False


def verify_credentials(username: str, password: str) -> bool:
    """Validate admin username/password. Constant-time compare."""
    user_ok = secrets.compare_digest(username, ADMIN_USER)
    # If ADMIN_PASS is empty and DASHBOARD_TOKEN is set, disallow password login
    # (force proper config for open-source users)
    if not ADMIN_PASS:
        return False
    pass_ok = secrets.compare_digest(password, ADMIN_PASS)
    return user_ok and pass_ok
