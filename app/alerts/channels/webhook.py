"""Generic HTTP webhook channel."""
import json
import os
import urllib.request
from datetime import datetime, timezone


def fire(config: dict, rule: dict, event: dict):
    """
    POST a structured JSON payload to any URL.
    Config keys: url (required), secret (Bearer token), method (default POST)
    Env fallback: CLAUDASH_ALERT_WEBHOOK, CLAUDASH_ALERT_WEBHOOK_SECRET
    """
    url = config.get("url") or os.getenv("CLAUDASH_ALERT_WEBHOOK", "")
    if not url:
        raise ValueError("Webhook URL not configured")

    payload = {
        "source": "claudash",
        "alert": {
            "rule_id": str(rule.get("_id", "")),
            "rule_name": rule.get("name", ""),
            "description": rule.get("description", ""),
        },
        "event": {
            "employee": event.get("employee"),
            "session_id": event.get("session_id"),
            "event_type": event.get("event_type"),
            "tool_name": event.get("tool_name"),
            "cwd": event.get("cwd"),
            "model": event.get("model"),
            "timestamp": event.get("timestamp", datetime.now(timezone.utc).isoformat()),
        },
        "fired_at": datetime.now(timezone.utc).isoformat(),
    }

    headers = {"Content-Type": "application/json"}
    secret = config.get("secret") or os.getenv("CLAUDASH_ALERT_WEBHOOK_SECRET", "")
    if secret:
        headers["Authorization"] = f"Bearer {secret}"

    method = config.get("method", "POST").upper()
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=5) as resp:
        if resp.status not in (200, 201, 202, 204):
            raise RuntimeError(f"Webhook responded {resp.status}")
