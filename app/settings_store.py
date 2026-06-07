"""
Runtime settings cache — reads from the `settings` MongoDB collection.
Refreshed every 30 s so the server picks up UI changes without a restart.
"""
from __future__ import annotations

import time
from typing import Any

_cache: dict = {}
_cache_ts: float = 0.0
CACHE_TTL = 30  # seconds


def get_settings() -> dict:
    global _cache, _cache_ts
    now = time.time()
    if now - _cache_ts > CACHE_TTL:
        try:
            from app.db import col
            doc = col("settings").find_one({"_id": "dashboard"}) or {}
            doc.pop("_id", None)
            _cache = doc
        except Exception:
            pass
        _cache_ts = now
    return _cache


def invalidate():
    """Force next call to re-read from DB."""
    global _cache_ts
    _cache_ts = 0.0


def get(key: str, default: Any = None) -> Any:
    return get_settings().get(key, default)
