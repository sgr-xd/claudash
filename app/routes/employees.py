from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pymongo import DESCENDING
from pydantic import BaseModel

from app.auth import check_auth
from app.db import col

router = APIRouter()


def _top_tools(email: str, limit: int = 5) -> list:
    pipeline = [
        {"$match": {"employee": email, "tool_counts": {"$exists": True}}},
        {"$project": {"tools": {"$objectToArray": "$tool_counts"}}},
        {"$unwind": "$tools"},
        {"$group": {"_id": "$tools.k", "count": {"$sum": "$tools.v"}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"name": "$_id", "count": 1, "_id": 0}},
    ]
    results = list(col("sessions").aggregate(pipeline))
    if not results:
        fallback = [
            {"$match": {"employee": email, "tool_name": {"$ne": None}}},
            {"$group": {"_id": "$tool_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit},
            {"$project": {"name": "$_id", "count": 1, "_id": 0}},
        ]
        results = list(col("events").aggregate(fallback))
    return results


def _mcp_activity(email: str) -> list:
    """Aggregate actual MCP tool calls from events (tool_name starts with mcp__)."""
    pipeline = [
        {"$match": {"employee": email, "tool_name": {"$regex": "^mcp__"}}},
        {"$project": {
            "server": {"$arrayElemAt": [{"$split": ["$tool_name", "__"]}, 1]},
            "tool": {"$arrayElemAt": [{"$split": ["$tool_name", "__"]}, 2]},
        }},
        {"$group": {"_id": "$server", "calls": {"$sum": 1}, "tools": {"$addToSet": "$tool"}}},
        {"$sort": {"calls": -1}},
        {"$project": {"server": "$_id", "calls": 1, "tools": 1, "_id": 0}},
    ]
    return list(col("events").aggregate(pipeline))


def _registered_mcps(email: str) -> list:
    """MCP servers registered in settings.json at session start (from sessions collection)."""
    pipeline = [
        {"$match": {"employee": email, "mcp_servers": {"$exists": True, "$ne": []}}},
        {"$unwind": "$mcp_servers"},
        {"$group": {"_id": "$mcp_servers", "sessions": {"$sum": 1}}},
        {"$sort": {"sessions": -1}},
        {"$project": {"name": "$_id", "sessions": 1, "_id": 0}},
    ]
    return list(col("sessions").aggregate(pipeline))


def _enabled_plugins(email: str) -> list:
    """Skills/plugins seen enabled at session start."""
    pipeline = [
        {"$match": {"employee": email, "enabled_plugins": {"$exists": True, "$ne": []}}},
        {"$unwind": "$enabled_plugins"},
        {"$group": {"_id": "$enabled_plugins", "sessions": {"$sum": 1}}},
        {"$sort": {"sessions": -1}},
        {"$project": {"name": "$_id", "sessions": 1, "_id": 0}},
    ]
    return list(col("sessions").aggregate(pipeline))


@router.get("/employees")
async def list_employees(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    employees = list(col("employees").find({}, {"_id": 0}).sort("last_seen", DESCENDING))
    for emp in employees:
        email = emp["email"]
        emp["total_sessions"] = col("sessions").count_documents({"employee": email})
        emp["active_sessions"] = col("sessions").count_documents({"employee": email, "status": "active"})
        emp["top_tools"] = _top_tools(email, limit=5)
        if emp.get("last_seen"):
            emp["last_seen"] = emp["last_seen"].isoformat()
        if emp.get("registered_at"):
            emp["registered_at"] = emp["registered_at"].isoformat()

    return {"employees": employees}


@router.get("/employees/{email:path}/mcp")
async def get_employee_mcp(email: str, request: Request):
    """MCP server activity + registered MCPs + enabled plugins for one employee."""
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    return {
        "mcp_activity": _mcp_activity(email),
        "registered_mcps": _registered_mcps(email),
        "enabled_plugins": _enabled_plugins(email),
    }


@router.get("/employees/{email:path}")
async def get_employee(email: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    emp = col("employees").find_one({"email": email}, {"_id": 0})
    if not emp:
        return Response("Not found", status_code=404)

    emp["total_sessions"] = col("sessions").count_documents({"employee": email})
    emp["active_sessions"] = col("sessions").count_documents({"employee": email, "status": "active"})
    emp["top_tools"] = _top_tools(email, limit=10)
    emp["mcp_activity"] = _mcp_activity(email)
    emp["registered_mcps"] = _registered_mcps(email)
    emp["enabled_plugins"] = _enabled_plugins(email)

    recent_sessions = list(
        col("sessions").find({"employee": email}, {"_id": 0}).sort("started_at", DESCENDING).limit(10)
    )
    for s in recent_sessions:
        for f in ("started_at", "ended_at", "last_event_at"):
            if s.get(f):
                s[f] = s[f].isoformat()

    emp["recent_sessions"] = recent_sessions

    for f in ("last_seen", "registered_at"):
        if emp.get(f):
            emp[f] = emp[f].isoformat()

    return emp


class RenameRequest(BaseModel):
    new_email: str


@router.put("/employees/{email:path}/rename")
async def rename_employee(email: str, body: RenameRequest, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    new_email = body.new_email.strip()
    if not new_email or new_email == email:
        return Response("new_email must be different", status_code=400)
    if col("employees").find_one({"email": new_email}):
        return Response("Target email already exists", status_code=409)
    emp = col("employees").find_one({"email": email})
    if not emp:
        return Response("Not found", status_code=404)

    col("employees").update_one({"email": email}, {"$set": {"email": new_email}})
    col("sessions").update_many({"employee": email}, {"$set": {"employee": new_email}})
    col("events").update_many({"employee": email}, {"$set": {"employee": new_email}})
    col("policies").update_many({"employee_id": email}, {"$set": {"employee_id": new_email}})
    return {"ok": True, "old_email": email, "new_email": new_email}


@router.delete("/employees/{email:path}")
async def delete_employee(email: str, request: Request, cascade: bool = False):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    if not col("employees").find_one({"email": email}):
        return Response("Not found", status_code=404)

    col("employees").delete_one({"email": email})
    deleted = {"employee": 1, "sessions": 0, "events": 0}
    if cascade:
        r_s = col("sessions").delete_many({"employee": email})
        r_e = col("events").delete_many({"employee": email})
        col("policies").delete_many({"employee_id": email})
        deleted["sessions"] = r_s.deleted_count
        deleted["events"] = r_e.deleted_count

    return {"ok": True, "deleted": deleted}
