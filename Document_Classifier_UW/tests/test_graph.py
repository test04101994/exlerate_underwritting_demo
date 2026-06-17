"""End-to-end smoke tests. The Bedrock call is stubbed (see fake_llm.py), so
these run offline without AWS — but the product itself is LLM + rules only."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
sys.path.insert(0, os.path.dirname(__file__))

import fake_llm  # noqa: E402
from classifier import llm  # noqa: E402

# Patch the Bedrock call with the deterministic test double.
llm.call_claude = fake_llm.fake_call_claude

import tempfile  # noqa: E402

from classifier import run_package, taxonomy, rules, schemas  # noqa: E402
from classifier.handler import handler  # noqa: E402
from classifier.loaders import load_package  # noqa: E402
from classifier.models import Document  # noqa: E402

SAMPLE = os.path.join(os.path.dirname(__file__), "..", "data", "sample_submission")


def test_loader_assigns_modality():
    _, docs = load_package(SAMPLE)
    assert len(docs) == 4
    assert {"email", "pdf"} <= {d.modality for d in docs}


def test_email_package_runs_use_case_and_lob():
    state = run_package(SAMPLE)
    assert "use_case" in state["enabled_heads"]
    fd = state["final_decision"]
    assert fd["primary_lob"] in ("General Liability", "Commercial Property")
    assert fd["use_case"] == "New Business"


def test_document_types_classified():
    types = {ev["final_doc_type"] for ev in run_package(SAMPLE)["evidence"]}
    assert "Loss Run" in types
    assert "Statement of Values (SOV)" in types


def test_reasoning_is_stored():
    state = run_package(SAMPLE)
    r = state["reasoning"]
    assert r["use_case"] and r["lob"] and r["overall"]          # why use case / lob / overall
    assert all(d["rationale"] for d in r["documents"])          # why each document type
    assert state["use_case"]["rationale"]
    assert state["lob"]["rationale"]


def test_use_case_rule_from_email_subject():
    """A subject-based rule decides the use case and the LLM is skipped."""
    def by_subject(summary):
        subj = " ".join(summary.get("email_subjects", [])).lower()
        if "renewal" in subj:
            return schemas.UseCase(use_case="Renewal", confidence=0.99,
                                   rationale="subject says renewal", alternatives=[])
        return None

    rules.register("predict_use_case", by_subject)
    try:
        event = {"documents": [{
            "file_name": "broker.eml", "modality": "email",
            "text": "Subject: Renewal for ACME GL policy\n\nplease renew the expiring "
                    "general liability policy."}]}
        result = handler(event)
        assert result["use_case"]["use_case"] == "Renewal"
        assert "subject" in result["reasoning"]["use_case"].lower()
    finally:
        rules.reset()


def test_lob_rule_from_policy_reference_anywhere():
    """A policy reference in the email body sets the LOB by prefix; LLM skipped."""
    def by_ref(summary):
        for ref in summary.get("policy_refs", []):
            if ref.startswith("PH"):
                return schemas.LOB(primary_lob="Commercial Property", additional_lobs=[],
                                   confidence=0.99, rationale=f"{ref} prefix PH -> Property")
        return None

    rules.register("predict_lob", by_ref)
    try:
        event = {"documents": [{
            "file_name": "broker.eml", "modality": "email",
            "text": "Subject: New submission\n\nPlease quote policy PH3123131 for ACME."}]}
        result = handler(event)
        assert result["lob"]["primary_lob"] == "Commercial Property"
        assert "PH3123131" in result["reasoning"]["lob"]
    finally:
        rules.reset()


def test_excel_only_uses_excel_classes_and_skips_use_case():
    event = {"documents": [{
        "file_name": "premium_bordereau.xlsx", "modality": "excel",
        "text": "[SHEET] Premium Bordereau\nPolicy Insured Line of Business Premium\n"
                "WC-1001 ACME Workers Compensation 48000"}]}
    result = handler(event)
    assert result["modalities"] == ["excel"]
    assert "use_case" not in result["enabled_heads"]
    types = {ev["final_doc_type"] for ev in result["evidence"]}
    assert types.issubset(set(taxonomy.get().doc_types_for("excel")))
    assert result["final_decision"]["primary_lob"] == "Workers Compensation"


def test_handler_drops_raw_documents():
    result = handler({"package_path": SAMPLE})
    assert "documents" not in result
    assert "final_decision" in result and "reasoning" in result


NEW_TAXONOMY_YAML = """
default_modality: pdf
modalities:
  pdf: {extensions: [".json", ".pdf"], document_type_set: standard, classify: [document_type, lob]}
document_types:
  - {name: Marine Bill of Lading, description: Shipping doc., keywords: [bill of lading, vessel]}
  - {name: Other / Unclassified, description: Fallback., keywords: []}
lines_of_business:
  - {name: Marine Cargo, description: Goods in transit., keywords: [marine cargo, bill of lading]}
  - {name: Unknown, description: Fallback., keywords: []}
use_cases:
  - {name: New Business, description: New., keywords: [new business], expected_documents: []}
  - {name: Unknown, description: Fallback., keywords: []}
"""


def test_new_category_via_yaml_no_code_change():
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as fh:
        fh.write(NEW_TAXONOMY_YAML)
        path = fh.name
    try:
        taxonomy.reload(path)
        # New value appears in the structured-output enum.
        lob_schema = llm.json_schema_for(schemas.LOB)
        assert lob_schema["properties"]["primary_lob"]["enum"] == ["Marine Cargo", "Unknown"]
        # And the fake LLM (keyword match) classifies it from the new keywords.
        out = fake_llm.fake_call_claude(schemas.LOB, "", "marine cargo bill of lading",
                                        doc_types=None)
        assert out.primary_lob == "Marine Cargo"
    finally:
        os.unlink(path)
        taxonomy.reload()


if __name__ == "__main__":
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("All smoke tests passed.")  # noqa: T201
