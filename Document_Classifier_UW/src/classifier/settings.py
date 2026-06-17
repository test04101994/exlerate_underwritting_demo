"""Project settings — loads config/settings.yaml with env-var overrides.

Operational config only (backend, Bedrock model, logging, plugins). The
classification vocabulary is in taxonomy.py / config/taxonomy.yaml.

Environment variables use the CLASSIFIER_ prefix.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]


def _settings_path() -> Path:
    env = os.getenv("CLASSIFIER_SETTINGS")
    return Path(env).expanduser() if env else REPO_ROOT / "config" / "settings.yaml"


def _abs(path: str | None) -> str | None:
    if not path:
        return None
    p = Path(path).expanduser()
    return str(p if p.is_absolute() else REPO_ROOT / p)


@dataclass
class Settings:
    log_level: str = "INFO"
    region: str = "us-east-1"
    model_profile_id: str = "us.anthropic.claude-opus-4-8"
    agent_models: dict = field(default_factory=dict)
    taxonomy_path: str | None = None
    rules_module: str | None = None
    enrichers_module: str | None = None

    def model_for(self, agent_name: str) -> str:
        """Bedrock model id for an agent:
        env CLASSIFIER_MODEL_<NAME> > settings agent_models > default profile."""
        env = os.getenv(f"CLASSIFIER_MODEL_{agent_name.upper()}")
        if env:
            return env
        return self.agent_models.get(agent_name, self.model_profile_id)


def _load() -> Settings:
    path = _settings_path()
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
    raw = raw or {}
    bedrock = raw.get("bedrock") or {}
    plugins = raw.get("plugins") or {}
    paths = raw.get("paths") or {}

    return Settings(
        log_level=os.getenv("CLASSIFIER_LOG_LEVEL", raw.get("log_level", "INFO")),
        region=os.getenv("AWS_REGION", bedrock.get("region", "us-east-1")),
        model_profile_id=os.getenv(
            "CLASSIFIER_MODEL",
            bedrock.get("model_profile_id", "us.anthropic.claude-opus-4-8")),
        agent_models=dict(bedrock.get("agent_models") or {}),
        taxonomy_path=_abs(os.getenv(
            "CLASSIFIER_TAXONOMY", paths.get("taxonomy", "config/taxonomy.yaml"))),
        rules_module=os.getenv("CLASSIFIER_RULES_MODULE", plugins.get("rules_module")),
        enrichers_module=os.getenv(
            "CLASSIFIER_ENRICHERS_MODULE", plugins.get("enrichers_module")),
    )


_cache: Settings | None = None


def get_settings() -> Settings:
    global _cache
    if _cache is None:
        _cache = _load()
    return _cache


def reload_settings() -> Settings:
    global _cache
    _cache = _load()
    return _cache
