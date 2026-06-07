from __future__ import annotations

import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Request

# ── Config ────────────────────────────────────────────────────────────────────

# Legacy bearer token — used by hook agents; accepted on all endpoints
DASHBOARD_TOKEN = os.getenv("DASHBOARD_TOKEN", "")

# Env-var admin credentials (fallback when no DB users exist)
ADMIN_USER = os.getenv("CLAUDASH_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("CLAUDASH_ADMIN_PASS", "")

# JWT signing secret
JWT_SECRET = os.getenv("CLAUDASH_JWT_SECRET") or secrets.token_hex(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("CLAUDASH_JWT_EXPIRE_HOURS", "24"))

if not ADMIN_PASS and not DASHBOARD_TOKEN:
    print(
        "⚠  WARNING: No CLAUDASH_ADMIN_PASS or DASHBOARD_TOKEN set.",
        file=sys.stderr,
    )


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(username: str, role: str = "admin") -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": username, "role": role, "exp": exp},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ── Auth check ────────────────────────────────────────────────────────────────

def _extract_bearer(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.query_params.get("token", "")


def check_auth(request: Request) -> bool:
    token = _extract_bearer(request)
    if not token:
        return False
    # Legacy static token (hook agents)
    if DASHBOARD_TOKEN and token == DASHBOARD_TOKEN:
        return True
    # JWT
    return decode_token(token) is not None


# ── Credential verification ───────────────────────────────────────────────────

def verify_credentials(username: str, password: str) -> Optional[dict]:
    """
    Returns user dict {username, role} on success, None on failure.
    Checks DB users first (bcrypt), then falls back to env-var admin.
    """
    # 1. DB users
    try:
        import bcrypt
        from app.db import col
        user = col("users").find_one({"username": username})
        if user:
            pw_hash = user.get("password_hash", "")
            if pw_hash and bcrypt.checkpw(password.encode(), pw_hash.encode()):
                return {"username": username, "role": user.get("role", "viewer")}
            return None  # username found but wrong password — don't fall through
    except Exception:
        pass

    # 2. Env-var fallback (no DB users seeded yet)
    if ADMIN_PASS:
        user_ok = secrets.compare_digest(username, ADMIN_USER)
        pass_ok = secrets.compare_digest(password, ADMIN_PASS)
        if user_ok and pass_ok:
            return {"username": username, "role": "admin"}

    return None
