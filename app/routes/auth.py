from __future__ import annotations

from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from app.auth import (
    check_auth, create_access_token, verify_credentials,
    JWT_EXPIRE_HOURS,
)
from app.db import col
from app.models import UserCreate

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    password: str


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/auth/login")
async def login(body: LoginRequest):
    user = verify_credentials(body.username, body.password)
    if not user:
        return JSONResponse({"detail": "Invalid credentials"}, status_code=401)
    token = create_access_token(user["username"], role=user.get("role", "admin"))
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_HOURS * 3600,
        "username": user["username"],
        "role": user.get("role", "admin"),
    }


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)
    users = list(col("users").find({}, {"_id": 0, "password_hash": 0}))
    for u in users:
        if u.get("created_at"):
            u["created_at"] = u["created_at"].isoformat()
    return {"users": users}


@router.post("/users")
async def create_user(body: UserCreate, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    if col("users").find_one({"username": body.username}):
        return Response("Username already exists", status_code=409)

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    col("users").insert_one({
        "username": body.username,
        "password_hash": pw_hash,
        "role": body.role,
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "username": body.username, "role": body.role}


@router.patch("/users/{username}/password")
async def change_password(username: str, body: ChangePasswordRequest, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    if not col("users").find_one({"username": username}):
        return Response("Not found", status_code=404)

    pw_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    col("users").update_one({"username": username}, {"$set": {"password_hash": pw_hash}})
    return {"ok": True}


@router.delete("/users/{username}")
async def delete_user(username: str, request: Request):
    if not check_auth(request):
        return Response("Unauthorized", status_code=401)

    result = col("users").delete_one({"username": username})
    if result.deleted_count == 0:
        return Response("Not found", status_code=404)
    return {"ok": True}
