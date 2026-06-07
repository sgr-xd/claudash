from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import create_access_token, verify_credentials, JWT_EXPIRE_HOURS

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
async def login(body: LoginRequest):
    if not verify_credentials(body.username, body.password):
        return JSONResponse(
            {"detail": "Invalid credentials"},
            status_code=401,
        )
    token = create_access_token(body.username)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": JWT_EXPIRE_HOURS * 3600,
        "username": body.username,
    }
