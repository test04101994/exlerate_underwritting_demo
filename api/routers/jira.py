"""Jira dashboard (S3) + config + REST helpers."""

from __future__ import annotations

import base64
import os
import json
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.credentials_service import load_credentials

router = APIRouter(prefix="/jira", tags=["jira"])

S3_BUCKET_DASHBOARD = os.environ.get("JIRA_CASES_BUCKET", "jira-cases-876570154422-prod")
S3_KEY_DASHBOARD = "dashboard/all-cases.json"
S3_REGION = os.environ.get("AWS_REGION", "us-east-1")

_jira_runtime_config: dict[str, Any] = {}


def _status_category(status: str) -> str:
    lower = status.lower()
    if any(s in lower for s in ("done", "closed", "resolved", "complete")):
        return "Done"
    if any(s in lower for s in ("in progress", "in review", "review")):
        return "In Progress"
    return "To Do"


def _jira_base_from_creds() -> str:
    c = load_credentials()
    return (c.get("jira") or {}).get("base_url", "").rstrip("/")


async def _tasks_from_s3() -> list[dict[str, Any]]:
    import boto3

    client = boto3.client("s3", region_name=S3_REGION)
    try:
        resp = client.get_object(Bucket=S3_BUCKET_DASHBOARD, Key=S3_KEY_DASHBOARD)
        body = resp["Body"].read().decode("utf-8")
        data = json.loads(body)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch cases from S3: {e}") from e

    cases = data.get("cases") or {}
    base = _jira_base_from_creds() or "https://digitalfx.atlassian.net"

    out: list[dict[str, Any]] = []
    for c in cases.values():
        key = c.get("issueKey")
        st = c.get("status") or "To Do"
        out.append(
            {
                "id": c.get("issueId") or key,
                "key": key,
                "summary": c.get("summary") or "",
                "description": "",
                "status": {"name": st, "category": _status_category(st)},
                "priority": {"name": c.get("priority") or "Medium"},
                "assignee": (
                    {"displayName": c["assignee"], "emailAddress": ""}
                    if c.get("assignee")
                    else None
                ),
                "reporter": {
                    "displayName": c.get("reporter")
                    or (c.get("lastUpdatedBy") or {}).get("displayName", "Unknown"),
                    "emailAddress": (c.get("lastUpdatedBy") or {}).get("email", ""),
                },
                "created": c.get("created") or c.get("lastUpdatedAt") or "",
                "updated": c.get("updated") or c.get("lastUpdatedAt") or "",
                "dueDate": c.get("dueDate"),
                "project": {"key": c.get("project") or "", "name": c.get("projectName") or ""},
                "issueType": {"name": c.get("issueType") or "Task"},
                "url": f"{base}/browse/{key}",
            }
        )
    return out


@router.get("/tasks")
async def jira_tasks() -> list[dict[str, Any]]:
    return await _tasks_from_s3()


@router.get("/config")
async def jira_config_get() -> dict[str, Any]:
    try:
        j = load_credentials().get("jira", {})
        return {
            "baseUrl": j.get("base_url", ""),
            "email": j.get("email", ""),
            "apiToken": "***masked***" if j.get("api_token") else "",
            "defaultProject": j.get("project_key", ""),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to load Jira configuration") from e


class JiraConfigPost(BaseModel):
    baseUrl: Optional[str] = None
    email: Optional[str] = None
    apiToken: Optional[str] = None
    defaultProject: Optional[str] = None


@router.post("/config")
async def jira_config_post_legacy(body: JiraConfigPost) -> dict[str, Any]:
    """Legacy: mirrors Node updating env vars (optional)."""
    if body.baseUrl:
        _jira_runtime_config["JIRA_BASE_URL"] = body.baseUrl
    if body.email:
        _jira_runtime_config["JIRA_EMAIL"] = body.email
    if body.apiToken and body.apiToken != "***masked***":
        _jira_runtime_config["JIRA_API_TOKEN"] = body.apiToken
    if body.defaultProject:
        _jira_runtime_config["JIRA_DEFAULT_PROJECT"] = body.defaultProject
    return {"success": True, "message": "Configuration updated successfully"}


class JiraConfigPut(BaseModel):
    baseUrl: str
    username: str
    apiToken: str
    projectKey: Optional[str] = None


@router.put("/config")
async def jira_config_put(body: JiraConfigPut) -> dict[str, Any]:
    if not body.baseUrl or not body.username or not body.apiToken:
        raise HTTPException(status_code=400, detail="Base URL, username, and API token are required")
    _jira_runtime_config["inline_jira"] = {
        "baseUrl": body.baseUrl,
        "username": body.username,
        "apiToken": body.apiToken,
        "projectKey": body.projectKey,
    }
    return {"success": True}


class TestConnBody(BaseModel):
    baseUrl: str
    email: Optional[str] = None
    username: Optional[str] = None
    apiToken: str


@router.post("/test-connection")
async def jira_test_connection(body: TestConnBody) -> dict[str, Any]:
    user = body.email or body.username
    if not body.baseUrl or not user or not body.apiToken:
        raise HTTPException(status_code=400, detail="Base URL, email, and API token are required")
    auth = base64.b64encode(f"{user}:{body.apiToken}".encode()).decode()
    url = f"{body.baseUrl.rstrip('/')}/rest/api/2/project"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                url,
                headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
            )
        if r.is_success:
            projects = r.json()
            return {
                "success": True,
                "projectCount": len(projects),
                "projects": [
                    {"key": p.get("key"), "name": p.get("name")} for p in projects[:5]
                ],
            }
        raise HTTPException(status_code=r.status_code, detail=r.text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection test failed: {e}") from e


@router.get("/test-issue/{issue_key}")
async def jira_test_issue(issue_key: str) -> dict[str, Any]:
    j = load_credentials().get("jira", {})
    base = j.get("base_url", "").rstrip("/")
    email = j.get("email", "")
    token = j.get("api_token", "")
    if not base or not email or not token:
        raise HTTPException(status_code=400, detail="Jira configuration not found")
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    url = f"{base}/rest/api/2/issue/{issue_key}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                url,
                headers={"Authorization": f"Basic {auth}", "Accept": "application/json"},
            )
        if not r.is_success:
            raise HTTPException(
                status_code=400,
                detail=r.json().get("errorMessages", [r.text]),
            )
        d = r.json()
        f = d.get("fields", {})
        return {
            "success": True,
            "issue": {
                "key": d.get("key"),
                "summary": f.get("summary"),
                "status": (f.get("status") or {}).get("name"),
                "project": (f.get("project") or {}).get("key"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/sync")
async def jira_sync() -> dict[str, Any]:
    tasks = await _tasks_from_s3()
    return {
        "success": True,
        "count": len(tasks),
        "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }
