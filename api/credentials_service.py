"""Load / save / validate config/credentials.json (same contract as Node credential-manager)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_CONFIG_PATH = _ROOT / "config" / "credentials.json"


def config_path() -> Path:
    return _CONFIG_PATH


def load_credentials() -> dict[str, Any]:
    with open(_CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_credentials(config: dict[str, Any]) -> None:
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)


def update_credentials(updates: dict[str, Any]) -> None:
    current = load_credentials()
    merged = _deep_merge(current, updates)
    save_credentials(merged)


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for k, v in patch.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def validate_credentials() -> tuple[bool, list[str]]:
    try:
        config = load_credentials()
    except Exception:
        return False, ["Configuration file"]
    missing: list[str] = []
    aws = config.get("aws", {})
    jira = config.get("jira", {})
    openrouter = config.get("openrouter", {})
    ak = aws.get("access_key_id") or ""
    sk = aws.get("secret_access_key") or ""
    if not ak or "EXAMPLE" in ak:
        missing.append("AWS Access Key ID")
    if not sk or "EXAMPLE" in sk:
        missing.append("AWS Secret Access Key")
    jt = jira.get("api_token") or ""
    if not jt or "..." in jt:
        missing.append("Jira API Token")
    ok = openrouter.get("api_key") or ""
    if not ok or "..." in ok:
        missing.append("OpenRouter API Key")
    return len(missing) == 0, missing


def masked_credentials() -> dict[str, Any]:
    config = load_credentials()
    out = json.loads(json.dumps(config))
    if "aws" in out:
        out["aws"]["access_key_id"] = "***masked***" if out["aws"].get("access_key_id") else ""
        out["aws"]["secret_access_key"] = "***masked***" if out["aws"].get("secret_access_key") else ""
        if out["aws"].get("session_token"):
            out["aws"]["session_token"] = "***masked***"
    if "jira" in out and out["jira"].get("api_token"):
        out["jira"]["api_token"] = "***masked***"
    if "openrouter" in out and out["openrouter"].get("api_key"):
        out["openrouter"]["api_key"] = "***masked***"
    return out
