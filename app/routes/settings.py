from __future__ import annotations

import os

from fastapi import APIRouter, Request
from fastapi.responses import Response

from app.auth import check_auth
from app.db import col
from app import settings_store
from app.models import SettingsUpdate

router = APIRouter()

_DEFAULTS = {
    "capture_prompts": False,
    "retention_days": 30,
}


@router.get("/settings")
async def get_settings(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    stored = settings_store.get_settings()
    return {**_DEFAULTS, **stored}


@router.put("/settings")
async def update_settings(body: SettingsUpdate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    patch = {}
    if body.capture_prompts is not None:
        patch["capture_prompts"] = body.capture_prompts
    if body.retention_days is not None:
        if body.retention_days < 1:
            return Response("retention_days must be >= 1", status_code=400)
        patch["retention_days"] = body.retention_days

    if patch:
        col("settings").update_one(
            {"_id": "dashboard"},
            {"$set": patch},
            upsert=True,
        )
        settings_store.invalidate()

    return {**_DEFAULTS, **settings_store.get_settings()}


@router.get("/settings/agent-token")
async def get_agent_token(request: Request):
    """Return the DASHBOARD_TOKEN so admins can copy it into the install command."""
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    token = os.getenv("DASHBOARD_TOKEN", "")
    return {"token": token, "hint": "Use this as CLAUDASH_TOKEN in the install command."}
