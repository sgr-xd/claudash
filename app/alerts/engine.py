"""
Alert engine — evaluates rules against incoming events and fires channels.
Runs in a background thread so it never blocks the ingest path.
"""

import fnmatch
import json
import threading
from datetime import datetime, timezone

from app.db import col

# In-memory cooldown tracker: {rule_id: last_fired_utc}
_cooldowns: dict = {}
_lock = threading.Lock()


def _matches_condition(event: dict, condition: dict) -> bool:
    """Return True if event satisfies ALL condition fields."""

    if condition.get("event_types"):
        if event.get("event_type") not in condition["event_types"]:
            return False

    if condition.get("employees"):
        if event.get("employee") not in condition["employees"]:
            return False

    if condition.get("mcp_only"):
        tool = event.get("tool_name") or ""
        if not tool.startswith("mcp__"):
            return False

    # tool_names supports glob patterns (e.g. "mcp__slack__*", "Bash")
    if condition.get("tool_names"):
        tool = event.get("tool_name") or ""
        matched = any(fnmatch.fnmatch(tool, pat) for pat in condition["tool_names"])
        if not matched:
            return False

    # input_contains — searches serialised tool_input + prompt_text
    if condition.get("input_contains"):
        raw_input = event.get("tool_input")
        serialised = json.dumps(raw_input) if isinstance(raw_input, dict) else str(raw_input or "")
        prompt = event.get("prompt_text") or ""
        haystack = (serialised + " " + prompt).lower()
        if not any(kw.lower() in haystack for kw in condition["input_contains"]):
            return False

    return True


def _is_on_cooldown(rule_id: str, cooldown_seconds: int) -> bool:
    with _lock:
        last = _cooldowns.get(rule_id)
        if last is None:
            return False
        return (datetime.now(timezone.utc) - last).total_seconds() < cooldown_seconds


def _mark_fired(rule_id: str):
    with _lock:
        _cooldowns[rule_id] = datetime.now(timezone.utc)


def evaluate_and_fire(event: dict):
    """
    Evaluate all enabled alert rules against this event.
    Best-effort — exceptions are swallowed so ingest is never affected.
    """
    try:
        rules = list(col("alert_rules").find({"enabled": True}))
        if not rules:
            return

        for rule in rules:
            try:
                if not _matches_condition(event, rule.get("condition", {})):
                    continue

                rule_id = str(rule["_id"])
                cooldown = rule.get("cooldown_seconds", 300)
                if _is_on_cooldown(rule_id, cooldown):
                    continue

                channels_fired = _fire_channels(rule, event, rule.get("channel_ids", []))
                if channels_fired:
                    _mark_fired(rule_id)
                    _record_history(rule, event, channels_fired)

            except Exception:
                pass

    except Exception:
        pass


def _fire_channels(rule: dict, event: dict, channel_ids: list) -> list:
    from app.alerts.channels import fire_channel
    from bson import ObjectId

    def to_oid(s):
        try:
            return ObjectId(s)
        except Exception:
            return None

    oids = [o for o in (to_oid(i) for i in channel_ids) if o is not None]
    if not oids:
        return []

    channels = list(col("alert_channels").find({"_id": {"$in": oids}, "enabled": True}))
    fired = []
    for ch in channels:
        try:
            fire_channel(ch, rule, event)
            fired.append(str(ch["_id"]))
        except Exception:
            pass
    return fired


def _record_history(rule: dict, event: dict, channels_fired: list):
    col("alert_history").insert_one({
        "rule_id": str(rule["_id"]),
        "rule_name": rule.get("name", ""),
        "employee": event.get("employee"),
        "session_id": event.get("session_id"),
        "event_type": event.get("event_type"),
        "tool_name": event.get("tool_name"),
        "cwd": event.get("cwd"),
        "channels_fired": channels_fired,
        "fired_at": datetime.now(timezone.utc),
    })
