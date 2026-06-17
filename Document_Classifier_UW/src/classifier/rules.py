"""Custom override functions — classify a step yourself and skip the LLM.

Register a function under an agent's name. When that agent runs, your function
is called FIRST with the same arguments the agent gets. If it returns a result,
that result is used and the LLM is skipped; if it returns None, the agent
proceeds normally.

    from classifier.rules import rule
    from classifier import schemas

    @rule("identify_document")          # the agent function's name
    def by_filename(doc):               # same args the agent receives
        if "bordereau" in doc.file_name.lower():
            return schemas.DocType(doc_type="Premium Bordereau",
                                   confidence=0.99, rationale="filename rule")
        return None                     # -> fall through to the LLM

Enable your module with plugins.rules_module in config/settings.yaml or the
CLASSIFIER_RULES_MODULE env var.
"""

from __future__ import annotations

import importlib
import logging

from .settings import get_settings

logger = logging.getLogger(__name__)

# agent name -> list of functions
_REGISTRY: dict[str, list] = {}
_loaded = False


def rule(agent_name: str):
    """Decorator: register a function as an override for ``agent_name``."""
    def deco(fn):
        _REGISTRY.setdefault(agent_name, []).append(fn)
        return fn
    return deco


def register(agent_name: str, fn) -> None:
    """Register without a decorator (handy in tests)."""
    _REGISTRY.setdefault(agent_name, []).append(fn)


def _load_module():
    global _loaded
    if _loaded:
        return
    _loaded = True
    module = get_settings().rules_module
    if module:
        try:
            importlib.import_module(module)
            logger.info("Loaded rules module: %s", module)
        except Exception:
            logger.exception("Could not import rules module %s", module)


def run(agent_name: str, *args):
    """Return the first override result for ``agent_name``, or None."""
    _load_module()
    for fn in _REGISTRY.get(agent_name, []):
        try:
            result = fn(*args)
        except Exception:
            logger.exception("Rule %r for %s failed; skipping.",
                             getattr(fn, "__name__", fn), agent_name)
            continue
        if result is not None:
            logger.debug("Rule %r handled %s (LLM skipped).",
                         getattr(fn, "__name__", fn), agent_name)
            return result
    return None


def reset() -> None:
    """Clear all registered rules (used by tests)."""
    global _loaded
    _REGISTRY.clear()
    _loaded = False
