from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pymongo import ASCENDING

from app.auth import check_auth
from app.db import col
from app.models import PolicyRule

router = APIRouter()


def _serialize_policy(p: dict) -> dict:
    p.pop("_id", None)
    for f in ("updated_at", "last_fetched_at"):
        if p.get(f):
            p[f] = p[f].isoformat()
    return p


@router.get("/policy")
async def list_policies(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    policies = list(col("policies").find({}, {"_id": 0}).sort("employee_id", ASCENDING))
    return {"policies": [_serialize_policy(p) for p in policies]}


@router.get("/policy/{employee_id:path}/settings")
async def get_policy_settings(employee_id: str, request: Request):
    """
    Returns a settings.json-compatible fragment the hook agent merges.
    Falls back to 'default' if no per-user policy exists.
    Records last_fetched_at so the UI can show confirmation receipts.
    """
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    now = datetime.now(timezone.utc)

    policy = col("policies").find_one({"employee_id": employee_id})
    if policy:
        col("policies").update_one(
            {"employee_id": employee_id},
            {"$set": {"last_fetched_at": now}},
        )
    else:
        policy = col("policies").find_one({"employee_id": "default"})

    if not policy:
        return {}

    fragment: dict = {}
    if policy.get("allow") or policy.get("deny"):
        fragment["permissions"] = {}
        if policy.get("allow"):
            fragment["permissions"]["allow"] = policy["allow"]
        if policy.get("deny"):
            fragment["permissions"]["deny"] = policy["deny"]
    if policy.get("mcpServers") and policy["mcpServers"]:
        fragment["mcpServers"] = policy["mcpServers"]
    if policy.get("enabledPlugins") and policy["enabledPlugins"]:
        fragment["enabledPlugins"] = policy["enabledPlugins"]
    if policy.get("model"):
        fragment["model"] = policy["model"]

    return fragment


@router.get("/policy/{employee_id:path}")
async def get_policy(employee_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    policy = col("policies").find_one({"employee_id": employee_id}, {"_id": 0})
    if not policy:
        return Response("Not found", status_code=404)
    return _serialize_policy(policy)


@router.put("/policy/{employee_id:path}")
async def upsert_policy(employee_id: str, rule: PolicyRule, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    now = datetime.now(timezone.utc)
    col("policies").update_one(
        {"employee_id": employee_id},
        {
            "$set": {
                "allow": rule.allow,
                "deny": rule.deny,
                "mcpServers": rule.mcpServers,
                "enabledPlugins": rule.enabledPlugins,
                "model": rule.model,
                "updated_at": now,
            },
            "$setOnInsert": {"employee_id": employee_id},
        },
        upsert=True,
    )
    return {"ok": True, "employee_id": employee_id}


@router.delete("/policy/{employee_id:path}")
async def delete_policy(employee_id: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    result = col("policies").delete_one({"employee_id": employee_id})
    if result.deleted_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}
