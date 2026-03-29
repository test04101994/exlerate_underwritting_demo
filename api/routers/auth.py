"""Session auth, WebSocket token exchange."""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from api.storage_memory import check_password, hash_password, storage

router = APIRouter(prefix="/auth", tags=["auth"])

# One-time WS tokens (30s TTL), same as Node wsTokens map
_ws_tokens: dict[str, dict[str, Any]] = {}


def _clean_ws_tokens() -> None:
    now = time.time() * 1000
    expired = [k for k, v in _ws_tokens.items() if v["expires"] < now]
    for k in expired:
        del _ws_tokens[k]


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(request: Request, body: LoginBody) -> dict[str, Any]:
    email = body.email.strip()
    password = body.password

    demo_ok = password in ("password123", "admin123")

    if demo_ok:
        user = storage.get_user_by_email(email)
        if not user:
            user = storage.create_user(
                email=email,
                password_hash=hash_password(password),
            )
    else:
        user = storage.get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not check_password(password, user.password):
            raise HTTPException(status_code=401, detail="Invalid credentials")

    user = storage.get_user_by_email(email)
    assert user is not None
    request.session["user_id"] = user.id
    return {
        "success": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "firstName": user.first_name,
            "lastName": user.last_name,
        },
    }


@router.post("/logout")
async def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"success": True}


def _require_user_id(request: Request) -> int:
    uid = request.session.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return int(uid)


@router.get("/user")
async def auth_user(request: Request) -> dict[str, Any]:
    uid = _require_user_id(request)
    user = storage.get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "email": user.email,
        "firstName": user.first_name,
        "lastName": user.last_name,
    }


@router.post("/ws-token")
async def ws_token(request: Request) -> dict[str, str]:
    uid = _require_user_id(request)
    user = storage.get_user(uid)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    _clean_ws_tokens()
    token = str(uuid.uuid4())
    _ws_tokens[token] = {
        "userId": user.id,
        "email": user.email,
        "expires": time.time() * 1000 + 30_000,
    }
    return {"token": token}


@router.get("/validate-ws-token")
async def validate_ws_token(token: Optional[str] = Query(None)) -> dict[str, Any]:
    if not token:
        return {"valid": False}
    _clean_ws_tokens()
    data = _ws_tokens.pop(token, None)
    if not data or data["expires"] < time.time() * 1000:
        return {"valid": False}
    return {"valid": True, "userId": data["userId"], "email": data["email"]}
