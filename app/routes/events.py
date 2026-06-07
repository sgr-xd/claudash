from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import queue
import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from pymongo import DESCENDING

from app.auth import check_auth
from app.db import col
from app.models import HookEvent
from app import settings_store

router = APIRouter()

# Env-var default for capture_prompts (can be overridden from DB settings)
_CAPTURE_PROMPTS_DEFAULT = os.getenv("CLAUDASH_CAPTURE_PROMPTS", "false").lower() == "true"

# SSE subscriber queues
_subscribers: list = []
_sub_lock = threading.Lock()

# High-volume tools whose inputs aren't useful to store
_STRIP_INPUT = {
    "Read", "Write", "Edit", "MultiEdit",
    "LS", "Glob", "Grep",
    "TodoRead", "TodoWrite",
    "NotebookRead", "NotebookEdit",
}


def _should_capture_prompts() -> bool:
    """Dynamic: reads from DB settings (30s cache), falls back to env var."""
    return settings_store.get("capture_prompts", _CAPTURE_PROMPTS_DEFAULT)


def _broadcast(event: dict):
    payload = f"data: {json.dumps(event, default=str)}\n\n"
    with _sub_lock:
        for q in _subscribers:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass


def _fire_alerts_bg(event_doc: dict):
    def _run():
        try:
            from app.alerts.engine import evaluate_and_fire
            evaluate_and_fire(event_doc)
        except Exception:
            pass
    threading.Thread(target=_run, daemon=True).start()


@router.post("/events")
async def ingest_event(event: HookEvent, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    now = datetime.now(timezone.utc)
    keep_input = event.tool_name not in _STRIP_INPUT if event.tool_name else True

    prompt_text = None
    if _should_capture_prompts() and event.event_type == "UserPromptSubmit":
        prompt_text = event.prompt_text or (
            event.tool_input.get("prompt") if isinstance(event.tool_input, dict) else None
        )

    doc = {
        "employee": event.employee,
        "device_id": event.device_id,
        "session_id": event.session_id,
        "event_type": event.event_type,
        "tool_name": event.tool_name,
        "tool_input": event.tool_input if keep_input else None,
        "tool_response": event.tool_response,
        "prompt_text": prompt_text,
        "cwd": event.cwd,
        "model": event.model,
        "claude_version": event.claude_version,
        "agent_version": event.agent_version,
        "timestamp": now,
    }

    col("events").insert_one(doc)

    # Upsert employee record — also track hook agent version
    emp_set: dict = {"last_seen": now, "device_id": event.device_id}
    if event.agent_version:
        emp_set["hook_version"] = event.agent_version
    col("employees").update_one(
        {"email": event.employee},
        {
            "$set": emp_set,
            "$setOnInsert": {"registered_at": now},
        },
        upsert=True,
    )

    # Session tracking
    if event.event_type == "SessionStart":
        sess_update: dict = {
            "$set": {
                "status": "active",
                "model": event.model,
                "employee": event.employee,
                "device_id": event.device_id,
                "cwd": event.cwd,
                "last_event_at": now,
            },
            "$setOnInsert": {
                "session_id": event.session_id,
                "started_at": now,
                "ended_at": None,
                "event_count": 0,
            },
        }
        if event.model:
            sess_update["$addToSet"] = {"models_used": event.model}
        # Store registered MCPs and plugins from settings.json (sent by hook agent)
        if event.mcp_servers is not None:
            sess_update["$set"]["mcp_servers"] = event.mcp_servers
        if event.enabled_plugins is not None:
            sess_update["$set"]["enabled_plugins"] = event.enabled_plugins

        col("sessions").update_one(
            {"session_id": event.session_id},
            sess_update,
            upsert=True,
        )
    elif event.event_type == "Stop":
        col("sessions").update_one(
            {"session_id": event.session_id},
            {
                "$set": {"ended_at": now, "status": "ended", "last_event_at": now},
                "$inc": {"event_count": 1},
            },
        )
    else:
        inc_fields: dict = {"event_count": 1}
        if event.tool_name and event.event_type in ("PostToolUse", "PreToolUse"):
            inc_fields[f"tool_counts.{event.tool_name}"] = 1

        set_fields: dict = {"last_event_at": now}
        add_to_set_fields: dict = {}
        if event.model:
            set_fields["model"] = event.model
            add_to_set_fields["models_used"] = event.model

        update: dict = {"$inc": inc_fields, "$set": set_fields}
        if add_to_set_fields:
            update["$addToSet"] = add_to_set_fields

        col("sessions").update_one({"session_id": event.session_id}, update)

    _fire_alerts_bg({**doc, "timestamp": now.isoformat()})
    _broadcast({"type": "event", "data": {**doc, "timestamp": now.isoformat()}})
    return {"ok": True}


@router.get("/events")
async def list_events(
    request: Request,
    employee: str = "",
    event_type: str = "",
    tool_name: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    page: int = 0,
    limit: int = 100,
):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    filt = _build_filter(employee, event_type, tool_name, date_from, date_to, search)
    skip = page * limit
    total = col("events").count_documents(filt)
    events_list = list(
        col("events").find(filt, {"_id": 0}).sort("timestamp", DESCENDING).skip(skip).limit(limit)
    )
    for e in events_list:
        if e.get("timestamp"):
            e["timestamp"] = e["timestamp"].isoformat()

    return {"events": events_list, "total": total, "page": page, "pages": max(1, -(-total // limit))}


@router.get("/events/export")
async def export_events(
    request: Request,
    format: str = "json",
    employee: str = "",
    event_type: str = "",
    tool_name: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    limit: int = 10_000,
):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    filt = _build_filter(employee, event_type, tool_name, date_from, date_to, search)
    rows = list(
        col("events").find(filt, {"_id": 0}).sort("timestamp", DESCENDING).limit(min(limit, 10_000))
    )
    for r in rows:
        if r.get("timestamp"):
            r["timestamp"] = r["timestamp"].isoformat()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    if format == "csv":
        fields = ["timestamp", "employee", "event_type", "tool_name", "cwd", "model",
                  "session_id", "device_id", "claude_version", "prompt_text"]
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            if "tool_input" in r and r["tool_input"]:
                r["tool_input"] = json.dumps(r["tool_input"])
            writer.writerow(r)
        return Response(
            content=buf.getvalue().encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=claudash-audit-{ts}.csv"},
        )
    else:
        return Response(
            content=json.dumps(rows, ensure_ascii=False, indent=2).encode("utf-8"),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=claudash-audit-{ts}.json"},
        )


@router.get("/events/stream")
async def event_stream(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    q: queue.Queue = queue.Queue(maxsize=200)
    with _sub_lock:
        _subscribers.append(q)

    loop = asyncio.get_running_loop()

    async def generate():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await loop.run_in_executor(None, lambda: q.get(timeout=1.0))
                    yield payload
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            with _sub_lock:
                if q in _subscribers:
                    _subscribers.remove(q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── helpers ────────────────────────────────────────────────────────────────────

def _build_filter(employee, event_type, tool_name, date_from, date_to, search) -> dict:
    filt: dict = {}
    if employee:
        filt["employee"] = employee
    if event_type:
        filt["event_type"] = event_type
    if tool_name:
        filt["tool_name"] = {"$regex": tool_name, "$options": "i"}
    if date_from or date_to:
        ts_filt: dict = {}
        if date_from:
            ts_filt["$gte"] = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        if date_to:
            ts_filt["$lte"] = (
                datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
                + timedelta(days=1)
            )
        filt["timestamp"] = ts_filt
    if search:
        filt["$or"] = [
            {"tool_name": {"$regex": search, "$options": "i"}},
            {"employee": {"$regex": search, "$options": "i"}},
            {"cwd": {"$regex": search, "$options": "i"}},
            {"prompt_text": {"$regex": search, "$options": "i"}},
        ]
    return filt
