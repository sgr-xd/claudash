from fastapi import APIRouter, Request
from fastapi.responses import Response
from pymongo import DESCENDING, ASCENDING

from app.auth import check_auth
from app.db import col

router = APIRouter()


def _serialize_session(s: dict) -> dict:
    s.pop("_id", None)
    if s.get("started_at"):
        s["started_at"] = s["started_at"].isoformat()
    if s.get("ended_at"):
        s["ended_at"] = s["ended_at"].isoformat()
    return s


@router.get("/sessions")
async def list_sessions(request: Request, limit: int = 50, employee: str = ""):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    filt = {}
    if employee:
        filt["employee"] = employee

    sessions = list(
        col("sessions").find(filt, {"_id": 0}).sort("started_at", DESCENDING).limit(limit)
    )
    return {"sessions": [_serialize_session(s) for s in sessions]}


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
