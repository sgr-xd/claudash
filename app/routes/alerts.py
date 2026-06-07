"""Alert rules, channels, and history management."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.auth import check_auth
from app.db import col
from app.models import AlertChannelCreate, AlertRuleCreate

router = APIRouter()


def _oid(id_str: str):
    try:
        return ObjectId(id_str)
    except Exception:
        return None


def _ser_rule(r: dict) -> dict:
    r["id"] = str(r.pop("_id"))
    for f in ("created_at", "updated_at"):
        if r.get(f):
            r[f] = r[f].isoformat()
    return r


def _ser_channel(c: dict) -> dict:
    c["id"] = str(c.pop("_id"))
    for f in ("created_at", "updated_at"):
        if c.get(f):
            c[f] = c[f].isoformat()
    # Redact sensitive config values from API responses
    cfg = c.get("config", {})
    for key in ("smtp_pass", "secret"):
        if key in cfg:
            cfg[key] = "••••••••"
    return c


def _ser_history(h: dict) -> dict:
    h["id"] = str(h.pop("_id"))
    if h.get("fired_at"):
        h["fired_at"] = h["fired_at"].isoformat()
    return h


# ── Rules ─────────────────────────────────────────────────────────────────────

@router.get("/alerts/rules")
async def list_rules(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    rules = list(col("alert_rules").find().sort("created_at", -1))
    return {"rules": [_ser_rule(r) for r in rules]}


@router.post("/alerts/rules")
async def create_rule(rule: AlertRuleCreate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    now = datetime.now(timezone.utc)
    doc = {
        **rule.model_dump(),
        "condition": rule.condition.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    result = col("alert_rules").insert_one(doc)
    return {"ok": True, "id": str(result.inserted_id)}


@router.put("/alerts/rules/{rule_id}")
async def update_rule(rule_id: str, rule: AlertRuleCreate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(rule_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    now = datetime.now(timezone.utc)
    result = col("alert_rules").update_one(
        {"_id": oid},
        {"$set": {**rule.model_dump(), "condition": rule.condition.model_dump(), "updated_at": now}},
    )
    if result.matched_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}


@router.patch("/alerts/rules/{rule_id}/toggle")
async def toggle_rule(rule_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(rule_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    rule = col("alert_rules").find_one({"_id": oid})
    if not rule:
        return Response("Not found", status_code=404)
    new_state = not rule.get("enabled", True)
    col("alert_rules").update_one(
        {"_id": oid},
        {"$set": {"enabled": new_state, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "enabled": new_state}


@router.delete("/alerts/rules/{rule_id}")
async def delete_rule(rule_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(rule_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    result = col("alert_rules").delete_one({"_id": oid})
    if result.deleted_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}


# ── Channels ──────────────────────────────────────────────────────────────────

@router.get("/alerts/channels")
async def list_channels(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    channels = list(col("alert_channels").find().sort("created_at", -1))
    return {"channels": [_ser_channel(c) for c in channels]}


@router.post("/alerts/channels")
async def create_channel(ch: AlertChannelCreate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    now = datetime.now(timezone.utc)
    doc = {**ch.model_dump(), "created_at": now, "updated_at": now}
    result = col("alert_channels").insert_one(doc)
    return {"ok": True, "id": str(result.inserted_id)}


@router.put("/alerts/channels/{channel_id}")
async def update_channel(channel_id: str, ch: AlertChannelCreate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(channel_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    now = datetime.now(timezone.utc)
    result = col("alert_channels").update_one(
        {"_id": oid},
        {"$set": {**ch.model_dump(), "updated_at": now}},
    )
    if result.matched_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}


@router.patch("/alerts/channels/{channel_id}/toggle")
async def toggle_channel(channel_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(channel_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    ch = col("alert_channels").find_one({"_id": oid})
    if not ch:
        return Response("Not found", status_code=404)
    new_state = not ch.get("enabled", True)
    col("alert_channels").update_one(
        {"_id": oid},
        {"$set": {"enabled": new_state, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"ok": True, "enabled": new_state}


@router.delete("/alerts/channels/{channel_id}")
async def delete_channel(channel_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(channel_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    result = col("alert_channels").delete_one({"_id": oid})
    if result.deleted_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}


@router.post("/alerts/channels/{channel_id}/test")
async def test_channel(channel_id: str, request: Request):
    """Send a test alert to verify channel configuration is correct."""
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    oid = _oid(channel_id)
    if not oid:
        return Response("Invalid ID", status_code=400)
    ch = col("alert_channels").find_one({"_id": oid})
    if not ch:
        return Response("Not found", status_code=404)

    from app.alerts.channels import fire_channel
    test_rule = {"name": "Test Alert", "description": "Connectivity test from claudash.", "_id": "test"}
    test_event = {
        "employee": "test@example.com", "event_type": "PostToolUse",
        "tool_name": "Bash", "cwd": "/test", "model": "claude-sonnet-4-6",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        fire_channel(ch, test_rule, test_event)
        return {"ok": True, "message": "Test alert sent successfully"}
    except Exception as e:
        return Response(f"Channel error: {e}", status_code=400)


# ── History ───────────────────────────────────────────────────────────────────

@router.get("/alerts/history")
async def list_history(request: Request, page: int = 0, limit: int = 50):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    skip = page * limit
    total = col("alert_history").count_documents({})
    history = list(
        col("alert_history")
        .find({}, {"_id": 1, "rule_id": 1, "rule_name": 1, "employee": 1,
                   "session_id": 1, "event_type": 1, "tool_name": 1,
                   "cwd": 1, "channels_fired": 1, "fired_at": 1})
        .sort("fired_at", -1)
        .skip(skip)
        .limit(limit)
    )
    return {
        "history": [_ser_history(h) for h in history],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }
