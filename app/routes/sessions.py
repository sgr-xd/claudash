from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pymongo import DESCENDING, ASCENDING

from app.auth import check_auth
from app.db import col

router = APIRouter()


def _serialize_session(s: dict) -> dict:
    s.pop("_id", None)
    for f in ("started_at", "ended_at", "last_event_at"):
        if s.get(f):
            s[f] = s[f].isoformat()
    return s


@router.get("/sessions")
async def list_sessions(
    request: Request,
    limit: int = 50,
    page: int = 0,
    employee: str = "",
    status: str = "",       # active | ended | stale | "" (all)
    date_from: str = "",
    date_to: str = "",
):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    filt: dict = {}
    if employee:
        filt["employee"] = employee
    if status:
        filt["status"] = status
    if date_from or date_to:
        ts_filt: dict = {}
        if date_from:
            ts_filt["$gte"] = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        if date_to:
            ts_filt["$lte"] = (
                datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
                + timedelta(days=1)
            )
        filt["started_at"] = ts_filt

    skip = page * limit
    total = col("sessions").count_documents(filt)
    sessions = list(
        col("sessions")
        .find(filt, {"_id": 0})
        .sort("started_at", DESCENDING)
        .skip(skip)
        .limit(limit)
    )
    return {
        "sessions": [_serialize_session(s) for s in sessions],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    session = col("sessions").find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        return Response("Not found", status_code=404)

    events = list(
        col("events")
        .find({"session_id": session_id}, {"_id": 0})
        .sort("timestamp", DESCENDING)
    )
    for e in events:
        if e.get("timestamp"):
            e["timestamp"] = e["timestamp"].isoformat()

    return {"session": _serialize_session(session), "events": events}
