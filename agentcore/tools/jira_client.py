"""Jira REST helpers (non-tool). Used by Jira tools, webhooks, and approval flows."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

import requests


def get_jira_config() -> dict:
    """Load Jira credentials from config/credentials.json or environment variables."""
    creds_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "credentials.json")
    if os.path.exists(creds_path):
        with open(creds_path) as f:
            config = json.load(f)
        return config.get("jira", {})
    # Fall back to environment variables (ECS task definition)
    return {
        "base_url": os.environ.get("JIRA_BASE_URL", ""),
        "email": os.environ.get("JIRA_EMAIL", ""),
        "api_token": os.environ.get("JIRA_API_TOKEN", ""),
        "default_project": os.environ.get("JIRA_DEFAULT_PROJECT", ""),
    }


def jira_headers() -> dict:
    """Build Jira auth headers."""
    cfg = get_jira_config()
    token = base64.b64encode(f"{cfg['email']}:{cfg['api_token']}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def call_jira_api(path: str, method: str = "GET", data: dict | None = None) -> dict:
    """Call Jira REST API. Used by webhook and reconciliation approve."""
    cfg = get_jira_config()
    url = f"{cfg['base_url']}{path}"
    headers = jira_headers()
    if method == "GET":
        resp = requests.get(url, headers=headers, timeout=15)
    elif method == "POST":
        resp = requests.post(url, headers=headers, json=data, timeout=15)
    else:
        resp = requests.request(method, url, headers=headers, json=data, timeout=15)
    resp.raise_for_status()
    return resp.json() if resp.text else {}


def post_jira_comment_v3(ticket_key: str, text: str) -> None:
    """Post a comment using Jira API v3 with ADF format."""
    cfg = get_jira_config()
    url = f"{cfg['base_url']}/rest/api/3/issue/{ticket_key}/comment"

    paragraphs: list[dict[str, Any]] = []
    for line in text.split("\n"):
        if line.strip():
            paragraphs.append({
                "type": "paragraph",
                "content": [{"type": "text", "text": line}],
            })
        else:
            paragraphs.append({"type": "paragraph", "content": []})

    if not paragraphs:
        paragraphs = [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]

    payload = {
        "body": {
            "type": "doc",
            "version": 1,
            "content": paragraphs,
        }
    }
    resp = requests.post(url, headers=jira_headers(), json=payload, timeout=15)
    resp.raise_for_status()
