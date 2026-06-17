"""AWS Lambda entry point.

Configure the function handler as:  classifier.handler.handler

The event provides documents inline (preferred) or a path bundled with the
deployment. See the events/ directory for sample test events.

    # inline
    {
      "package_id": "ACME-2026-001",
      "documents": [
        {"file_name": "broker.eml", "modality": "email", "text": "..."},
        {"file_name": "loss_run.json", "modality": "pdf", "text": "..."}
      ]
    }

    # or a bundled path
    { "package_path": "data/sample_submission" }

Returns the classification result (JSON-serializable): final_decision, summary,
evidence, the classification heads, and any enrichment custom keys.
"""

from __future__ import annotations

import logging

from . import pipeline
from .logging_setup import configure
from .settings import get_settings

# Configure logging once at cold start.
configure(get_settings().log_level)
logger = logging.getLogger("classifier.handler")


def _jsonable(state: dict) -> dict:
    """Drop non-serializable internals (the raw Document objects)."""
    out = dict(state)
    out.pop("documents", None)
    return out


def handler(event, context=None):
    """Lambda handler. ``event`` is the dict described in the module docstring."""
    logger.info("Received event with keys: %s", sorted((event or {}).keys()))
    try:
        result = pipeline.classify(event or {})
    except ValueError as exc:
        logger.error("Bad event: %s", exc)
        return {"error": str(exc)}
    return _jsonable(result)
