"""Output enrichers — add custom keys to the final result.

Register a function; after the decision is made it runs and returns a dict of
extra keys (or None to add nothing). The keys appear in the result under
``enrichment`` (flat) and ``enrichment_by`` (grouped by enricher name).

    from classifier.enrichers import enricher

    @enricher("sla")
    def sla(result):                     # result = the full pipeline output dict
        if result["final_decision"]["primary_lob"] != "Cyber Liability":
            return None                  # only add for some cases
        return {"sla_hours": 4}

Enable your module with plugins.enrichers_module in config/settings.yaml or the
CLASSIFIER_ENRICHERS_MODULE env var.
"""

from __future__ import annotations

import importlib
import logging

from .settings import get_settings

logger = logging.getLogger(__name__)

# list of (name, fn) in registration order
_REGISTRY: list[tuple[str, object]] = []
_loaded = False


def enricher(name: str | None = None):
    def deco(fn):
        _REGISTRY.append((name or fn.__name__, fn))
        return fn
    return deco


def register(fn, name: str | None = None) -> None:
    _REGISTRY.append((name or fn.__name__, fn))


def _load_module():
    global _loaded
    if _loaded:
        return
    _loaded = True
    module = get_settings().enrichers_module
    if module:
        try:
            importlib.import_module(module)
            logger.info("Loaded enrichers module: %s", module)
        except Exception:
            logger.exception("Could not import enrichers module %s", module)


def run(result: dict) -> dict:
    """Run all enrichers; return {'enrichment': {...}, 'enrichment_by': {...}}."""
    _load_module()
    flat, by_name = {}, {}
    for name, fn in _REGISTRY:
        try:
            data = fn(result)
        except Exception:
            logger.exception("Enricher %r failed; skipping.", name)
            continue
        if not data:
            continue
        if not isinstance(data, dict):
            logger.warning("Enricher %r returned %s, expected dict; skipping.", name, type(data))
            continue
        by_name[name] = data
        flat.update(data)
    if by_name:
        logger.info("Enrichment added keys from: %s", ", ".join(by_name))
    return {"enrichment": flat, "enrichment_by": by_name}


def reset() -> None:
    global _loaded
    _REGISTRY.clear()
    _loaded = False
