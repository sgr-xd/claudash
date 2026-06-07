from fastapi import APIRouter, Request
from fastapi.responses import Response
from pymongo import DESCENDING
from pydantic import BaseModel

from app.auth import check_auth
from app.db import col

router = APIRouter()


def _top_tools(email: str, limit: int = 5) -> list[dict]:
    """Aggregate tool usage from sessions.tool_counts (permanent record).
    Falls back to events collection for sessions that predate tool_counts tracking."""
    pipeline = [
        {"$match": {"employee": email, "tool_counts": {"$exists": True}}},
        # Explode the tool_counts map into [{k: toolName, v: count}, ...]
        {"$project": {"tools": {"$objectToArray": "$tool_counts"}}},
        {"$unwind": "$tools"},
        {"$group": {"_id": "$tools.k", "count": {"$sum": "$tools.v"}}},
        {"$sort": {"count": -1}},
        {"$limit": limit},
        {"$project": {"name": "$_id", "count": 1, "_id": 0}},
    ]
    results = list(col("sessions").aggregate(pipeline))

    # Fallback: if no sessions have tool_counts yet, scan events (old behaviour)
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


@router.get("/employees")
async def list_employees(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    employees = list(
        col("employees").find({}, {"_id": 0}).sort("last_seen", DESCENDING)
    )

    for emp in employees:
        email = emp["email"]
        emp["total_sessions"] = col("sessions").count_documents({"employee": email})
        emp["active_sessions"] = col("sessions").count_documents(
            {"employee": email, "status": "active"}
        )
        emp["top_tools"] = _top_tools(email, limit=5)
        if emp.get("last_seen"):
            emp["last_seen"] = emp["last_seen"].isoformat()
        if emp.get("registered_at"):
            emp["registered_at"] = emp["registered_at"].isoformat()

    return {"employees": employees}


@router.get("/employees/{email:path}")
async def get_employee(email: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    emp = col("employees").find_one({"email": email}, {"_id": 0})
    if not emp:
        return Response("Not found", status_code=404)

    emp["total_sessions"] = col("sessions").count_documents({"employee": email})
    emp["active_sessions"] = col("sessions").count_documents(
        {"employee": email, "status": "active"}
    )
    emp["top_tools"] = _top_tools(email, limit=10)

    recent_sessions = list(
        col("sessions")
        .find({"employee": email}, {"_id": 0})
        .sort("started_at", DESCENDING)
        .limit(10)
    )
    for s in recent_sessions:
        if s.get("started_at"):
            s["started_at"] = s["started_at"].isoformat()
        if s.get("ended_at"):
            s["ended_at"] = s["ended_at"].isoformat()

    emp["recent_sessions"] = recent_sessions

    if emp.get("last_seen"):
        emp["last_seen"] = emp["last_seen"].isoformat()
    if emp.get("registered_at"):
        emp["registered_at"] = emp["registered_at"].isoformat()

    return emp


class RenameRequest(BaseModel):
    new_email: str


@router.put("/employees/{email:path}/rename")
async def rename_employee(email: str, body: RenameRequest, request: Request):
    """Rename an employee (updates email across all collections)."""
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    new_email = body.new_email.strip()
    if not new_email or new_email == email:
        return Response("new_email must be different", status_code=400)

    # Check target doesn't already exist
    if col("employees").find_one({"email": new_email}):
        return Response("Target email already exists", status_code=409)

    emp = col("employees").find_one({"email": email})
    if not emp:
        return Response("Not found", status_code=404)

    # Update employee record
    col("employees").update_one({"email": email}, {"$set": {"email": new_email}})
    # Update all sessions
    col("sessions").update_many({"employee": email}, {"$set": {"employee": new_email}})
    # Update all events (best-effort; events may be expired)
    col("events").update_many({"employee": email}, {"$set": {"employee": new_email}})
    # Update policies
    col("policies").update_many({"employee_id": email}, {"$set": {"employee_id": new_email}})

    return {"ok": True, "old_email": email, "new_email": new_email}


@router.delete("/employees/{email:path}")
async def delete_employee(
    email: str,
    request: Request,
    cascade: bool = False,
):
    """Delete an employee.

    ?cascade=true also deletes their sessions and events.
    By default only the employee record is removed; history is preserved.
    """
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    emp = col("employees").find_one({"email": email})
    if not emp:
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
