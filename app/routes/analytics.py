from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.auth import check_auth
from app.db import col

router = APIRouter()


@router.get("/analytics/overview")
async def overview(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hour_ago_24 = now - timedelta(hours=24)

    total_employees = col("employees").count_documents({})
    active_sessions = col("sessions").count_documents({"status": "active"})
    events_today = col("events").count_documents({"timestamp": {"$gte": day_start}})

    # Top tools today
    top_tools = list(
        col("events").aggregate([
            {"$match": {"timestamp": {"$gte": day_start}, "tool_name": {"$ne": None}}},
            {"$group": {"_id": "$tool_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
            {"$project": {"name": "$_id", "count": 1, "_id": 0}},
        ])
    )

    # Top MCPs today (tool names starting with "mcp__")
    top_mcps = list(
        col("events").aggregate([
            {
                "$match": {
                    "timestamp": {"$gte": day_start},
                    "tool_name": {"$regex": "^mcp__"},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$let": {
                            "vars": {
                                "parts": {"$split": ["$tool_name", "__"]}
                            },
                            "in": {"$arrayElemAt": ["$$parts", 1]},
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1}},
            {"$limit": 10},
            {"$project": {"name": "$_id", "count": 1, "_id": 0}},
        ])
    )

    # Events by hour (last 24 hours)
    events_by_hour_raw = list(
        col("events").aggregate([
            {"$match": {"timestamp": {"$gte": hour_ago_24}}},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$timestamp"},
                        "month": {"$month": "$timestamp"},
                        "day": {"$dayOfMonth": "$timestamp"},
                        "hour": {"$hour": "$timestamp"},
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"_id": 1}},
        ])
    )
    events_by_hour = [
        {
            "hour": f"{r['_id']['hour']:02d}:00",
            "count": r["count"],
        }
        for r in events_by_hour_raw
    ]

    return {
        "total_employees": total_employees,
        "active_sessions_now": active_sessions,
        "events_today": events_today,
        "top_tools": top_tools,
        "top_mcps": top_mcps,
        "events_by_hour": events_by_hour,
    }


@router.get("/analytics/tools")
async def tools_breakdown(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    tools = list(
        col("events").aggregate([
            {"$match": {"tool_name": {"$ne": None}}},
            {"$group": {"_id": "$tool_name", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
            {"$project": {"tool_name": "$_id", "count": 1, "_id": 0}},
        ])
    )
    return {"tools": tools}


@router.get("/analytics/mcps")
async def mcps_breakdown(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    mcps = list(
        col("events").aggregate([
            {"$match": {"tool_name": {"$regex": "^mcp__"}}},
            {
                "$group": {
                    "_id": {
                        "$let": {
                            "vars": {"parts": {"$split": ["$tool_name", "__"]}},
                            "in": {"$arrayElemAt": ["$$parts", 1]},
                        }
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"count": -1}},
            {"$project": {"server": "$_id", "count": 1, "_id": 0}},
        ])
    )
    return {"mcps": mcps}


@router.get("/analytics/trend")
async def trend(request: Request, days: int = 7, employee: str = ""):
    """
    Daily breakdown of sessions + events for the last N days.
    Uses sessions collection (permanent — not subject to events TTL).
    """
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    days = max(1, min(days, 365))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    match: dict = {"started_at": {"$gte": cutoff}}
    if employee:
        match["employee"] = employee

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": {
                    "y": {"$year": "$started_at"},
                    "m": {"$month": "$started_at"},
                    "d": {"$dayOfMonth": "$started_at"},
                },
                "sessions": {"$sum": 1},
                "events": {"$sum": "$event_count"},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    raw = list(col("sessions").aggregate(pipeline))
    data = [
        {
            "date": f"{r['_id']['y']:04d}-{r['_id']['m']:02d}-{r['_id']['d']:02d}",
            "sessions": r["sessions"],
            "events": r["events"],
        }
        for r in raw
    ]

    return {
        "days": days,
        "employee": employee or None,
        "data": data,
        "totals": {
            "sessions": sum(d["sessions"] for d in data),
            "events": sum(d["events"] for d in data),
        },
    }
