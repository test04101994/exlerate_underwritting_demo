"""Config / credentials endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from api.credentials_service import (
    load_credentials,
    masked_credentials,
    update_credentials,
    validate_credentials,
)

router = APIRouter(prefix="/config", tags=["config"])


def _require_session(request: Request) -> None:
    if not request.session.get("user_id"):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/credentials/validate")
async def credentials_validate(request: Request) -> dict[str, Any]:
    _require_session(request)
    ok, missing = validate_credentials()
    if not ok:
        return JSONResponse(
            status_code=400,
            content={
                "valid": False,
                "missing": missing,
                "message": f"Missing required credentials: {', '.join(missing)}",
            },
        )
    config = load_credentials()
    return {
        "valid": True,
        "services": {
            "aws": {
                "configured": bool(config["aws"].get("access_key_id"))
                and "EXAMPLE" not in (config["aws"].get("access_key_id") or ""),
                "region": config["aws"].get("region"),
            },
            "jira": {
                "configured": bool(config["jira"].get("api_token"))
                and "..." not in (config["jira"].get("api_token") or ""),
                "baseUrl": config["jira"].get("base_url"),
                "email": config["jira"].get("email"),
            },
            "openrouter": {
                "configured": bool(config["openrouter"].get("api_key"))
                and "..." not in (config["openrouter"].get("api_key") or ""),
                "model": config["openrouter"].get("models", {}).get("primary"),
            },
        },
        "features": config.get("features", {}),
    }


@router.get("/credentials")
async def credentials_get(request: Request) -> dict[str, Any]:
    _require_session(request)
    try:
        return masked_credentials()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to load credentials") from e


@router.post("/credentials")
async def credentials_post(request: Request, body: dict[str, Any]) -> dict[str, Any]:
    _require_session(request)
    try:
        update_credentials(body)
        return {"success": True, "message": "Credentials updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update credentials") from e
