"""Example override functions.

Enable with:  CLASSIFIER_RULES_MODULE=classifier.example_rules
(or plugins.rules_module in config/settings.yaml)

Each function is registered for an agent and receives the same arguments that
agent receives. Return a result to skip the LLM, or None to fall through.
"""

from __future__ import annotations

import re

from . import schemas
from .rules import rule

# Map an email-subject keyword -> the use case to assign. Edit freely.
_SUBJECT_RULES = [
    ("renewal", "Renewal"),
    ("renew", "Renewal"),
    ("endorsement", "Endorsement"),
    ("policy change", "Endorsement"),
    ("audit", "Audit"),
    ("cancel", "Cancellation"),
    ("non-renewal", "Cancellation"),
    ("new business", "New Business"),
    ("new submission", "New Business"),
]


@rule("predict_use_case")
def use_case_from_email_subject(summary):
    """Decide the use case from the email subject; skip the LLM on a match.

    The aggregated summary carries every email's subject line in
    ``email_subjects``. If a configured keyword appears, return that use case
    (with a reasoning string). If nothing matches — or there is no email — return
    None so the LLM classifies the use case instead.
    """
    subjects = " ".join(summary.get("email_subjects", [])).lower()
    if not subjects:
        return None
    for keyword, use_case in _SUBJECT_RULES:
        if keyword in subjects:
            return schemas.UseCase(
                use_case=use_case, confidence=0.99,
                rationale=f"Email subject matched '{keyword}' -> {use_case} (subject rule).",
                alternatives=[])
    return None  # subject didn't match any rule -> let the LLM decide


# Map a policy-reference PREFIX -> the line of business. Edit freely.
_POLICY_PREFIX_LOB = {
    "PH": "Commercial Property",
    "GL": "General Liability",
    "WC": "Workers Compensation",
    "CA": "Commercial Auto",
    "CY": "Cyber Liability",
}


@rule("predict_lob")
def lob_from_policy_reference(summary):
    """Decide the LOB from a policy reference found anywhere (subject/body/attachment).

    The aggregated summary carries every detected reference in ``policy_refs``
    (e.g. 'PH3123131'). The leading letters are the prefix; map it to an LOB. If
    no reference matches a known prefix, return None so the LLM decides the LOB.
    """
    for ref in summary.get("policy_refs", []):
        match = re.match(r"[A-Za-z]+", ref)
        prefix = match.group(0).upper() if match else ""
        lob = _POLICY_PREFIX_LOB.get(prefix)
        if lob:
            return schemas.LOB(
                primary_lob=lob, additional_lobs=[], confidence=0.99,
                rationale=f"Policy reference '{ref}' (prefix '{prefix}') -> {lob} (rule).")
    return None  # no known prefix -> let the LLM decide


@rule("identify_document")
def excel_bordereau_by_filename(doc):
    """Classify an Excel file named '*bordereau*' without calling the LLM."""
    if doc.modality != "excel":
        return None
    name = doc.file_name.lower()
    if "bordereau" not in name:
        return None
    dt = "Loss Bordereau" if ("loss" in name or "claim" in name) else "Premium Bordereau"
    return schemas.DocType(doc_type=dt, confidence=0.99,
                           rationale=f"Filename rule -> {dt} (no LLM).")
