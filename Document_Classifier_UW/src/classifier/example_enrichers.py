"""Example output enrichers (enabled by default in config/settings.yaml).

Each receives the full result dict and returns extra keys, or None to add
nothing. Copy this file and point CLASSIFIER_ENRICHERS_MODULE at your version.
"""

from __future__ import annotations

from . import taxonomy
from .enrichers import enricher


@enricher("completeness")
def completeness(result: dict):
    """Score documents present vs. expected for the use case.

    Only relevant when use case was classified (e.g. email) — returns None
    otherwise. A clear example of 'additional info for some cases only'.
    """
    if "use_case" not in result.get("enabled_heads", []):
        return None
    decision = result.get("final_decision", {})
    summary = result.get("summary", {})
    expected = taxonomy.get().use_case_expected_documents.get(decision.get("use_case", ""), [])
    present = set((summary.get("doc_type_counts") or {}).keys())
    if not expected:
        return {"completeness_score": 1.0, "missing_documents": []}
    missing = [d for d in expected if d not in present]
    return {"completeness_score": round((len(expected) - len(missing)) / len(expected), 2),
            "missing_documents": missing}


@enricher("triage")
def triage_priority(result: dict):
    """Derive a triage priority from confidence and flags."""
    decision = result.get("final_decision", {})
    confidence = decision.get("overall_confidence", 0.0) or 0.0
    flags = decision.get("flags", []) or []
    if confidence < 0.5 or len(flags) >= 2:
        priority = "high"
    elif confidence < 0.75:
        priority = "medium"
    else:
        priority = "low"
    return {"triage_priority": priority}


@enricher("insured")
def insured_name(result: dict):
    """Surface the insured name from the aggregated entities, if present."""
    for e in (result.get("summary", {}) or {}).get("entities", []):
        if e.startswith("insured_name="):
            return {"insured_name": e.split("=", 1)[1]}
    return None
