"""The pipeline — a simple, linear LangGraph over the ten agents.

    load -> analyze_documents -> aggregate -> classify -> finalize -> enrich

`analyze_documents` loops over the documents (identify + keyword + semantic +
structure + merge per document). It's a plain loop for clarity; to parallelize,
swap the loop for a thread pool — the agents are independent per document.

Entry points:
  run_package(path)         load a directory/file from disk, then run
  run_documents(docs, id)   run over already-built Document objects (e.g. Lambda)
  classify(event)           dispatch an event dict to one of the above
"""

from __future__ import annotations

import logging
import os
import re
from collections import Counter
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from . import agents, enrichers, taxonomy
from .loaders import load_package
from .models import Document

logger = logging.getLogger(__name__)


class State(TypedDict, total=False):
    package_id: str
    documents: list[Document]
    modalities: list[str]
    enabled_heads: list[str]
    evidence: list[dict]
    summary: dict
    use_case: dict
    lob: dict
    final_decision: dict
    reasoning: dict
    enrichment: dict
    enrichment_by: dict


def _email_subjects(documents: list[Document]) -> list[str]:
    """Pull the subject line from each email document (for subject-based rules)."""
    subjects = []
    for d in documents:
        if d.modality != "email":
            continue
        subject = None
        for kv in d.key_values or []:
            if kv.lower().startswith("subject="):
                subject = kv.split("=", 1)[1].strip()
        if not subject:
            m = re.search(r"(?im)^subject:\s*(.+)$", d.text or "")
            if m:
                subject = m.group(1).strip()
        if subject:
            subjects.append(subject)
    return subjects


# A policy reference: letters then digits, e.g. PH3123131 or GL-0098123.
_POLICY_RE = re.compile(r"\b([A-Za-z]{2,5}-?\d{5,})\b")


def _policy_refs(documents: list[Document]) -> list[str]:
    """Find policy references anywhere — subject, body, or any attachment text."""
    refs: list[str] = []
    for d in documents:
        haystack = (d.text or "") + " " + " ".join(d.key_values or [])
        for match in _POLICY_RE.findall(haystack):
            ref = match.replace("-", "").upper()
            if ref not in refs:
                refs.append(ref)
    return refs


def load(state: State) -> dict[str, Any]:
    documents = state["documents"]
    modalities = sorted({d.modality for d in documents})
    enabled = taxonomy.get().enabled_heads(modalities)
    logger.info("Package '%s': %d doc(s), modalities=%s, enabled_heads=%s",
                state.get("package_id"), len(documents), modalities, enabled)
    return {"modalities": modalities, "enabled_heads": enabled}


def analyze_documents(state: State) -> dict[str, Any]:
    evidence = []
    for doc in state["documents"]:
        ident = agents.identify_document(doc)
        doc.doc_type = ident.doc_type
        doc.doc_type_confidence = ident.confidence

        kw = agents.extract_keywords(doc)
        se = agents.analyze_meaning(doc)
        st = agents.detect_structure(doc)
        merged = agents.merge_evidence(doc, kw, se, st)

        evidence.append({**merged.model_dump(), "doc_id": doc.doc_id,
                         "file_name": doc.file_name, "modality": doc.modality})
    logger.info("Analyzed %d document(s).", len(evidence))
    return {"evidence": evidence}


def aggregate(state: State) -> dict[str, Any]:
    doc_counts: Counter = Counter()
    lob_tally: Counter = Counter()
    uc_tally: Counter = Counter()
    entities: list[str] = []
    per_doc: list[dict] = []

    for ev in state["evidence"]:
        doc_counts[ev.get("final_doc_type", "Other / Unclassified")] += 1
        for lob in ev.get("lob_signals", []):
            if lob != "Unknown":
                lob_tally[lob] += 1
        for uc in ev.get("use_case_signals", []):
            if uc != "Unknown":
                uc_tally[uc] += 1
        entities += ev.get("key_entities", [])
        per_doc.append({"doc_id": ev.get("doc_id"), "file_name": ev.get("file_name"),
                        "doc_type": ev.get("final_doc_type"), "modality": ev.get("modality"),
                        "rationale": ev.get("rationale")})

    summary = {
        "package_id": state.get("package_id"),
        "modalities": state.get("modalities", []),
        "enabled_heads": state.get("enabled_heads", []),
        "email_subjects": _email_subjects(state["documents"]),
        "policy_refs": _policy_refs(state["documents"]),
        "document_count": len(state["evidence"]),
        "doc_type_counts": dict(doc_counts),
        "lob_tally": dict(lob_tally),
        "use_case_tally": dict(uc_tally),
        "entities": list(dict.fromkeys(entities))[:40],
        "documents": per_doc,
    }
    return {"summary": summary}


def classify_node(state: State) -> dict[str, Any]:
    summary = state["summary"]
    out: dict[str, Any] = {"lob": agents.predict_lob(summary).model_dump()}
    if "use_case" in state.get("enabled_heads", []):
        out["use_case"] = agents.predict_use_case(summary).model_dump()
    return out


def finalize(state: State) -> dict[str, Any]:
    applicable = "use_case" in state.get("enabled_heads", [])
    use_case = state.get("use_case") or {
        "use_case": "Unknown", "confidence": 0.0,
        "rationale": "Not applicable for this modality.", "alternatives": []}
    lob = state.get("lob") or {
        "primary_lob": "Unknown", "additional_lobs": [],
        "confidence": 0.0, "rationale": "Not classified."}
    decision = agents.finalize_decision(state["summary"], use_case, lob, applicable)
    logger.info("Decision: lob=%s use_case=%s confidence=%s",
                decision.primary_lob, decision.use_case, decision.overall_confidence)

    # Consolidated reasoning: why each thing was decided.
    reasoning = {
        "use_case": use_case.get("rationale"),
        "lob": lob.get("rationale"),
        "documents": [
            {"file_name": d.get("file_name"), "doc_type": d.get("doc_type"),
             "rationale": d.get("rationale")}
            for d in state["summary"].get("documents", [])
        ],
        "overall": decision.rationale,
    }
    return {"final_decision": decision.model_dump(), "reasoning": reasoning}


def enrich(state: State) -> dict[str, Any]:
    return enrichers.run(dict(state))


def _build_graph():
    g = StateGraph(State)
    g.add_node("load", load)
    g.add_node("analyze_documents", analyze_documents)
    g.add_node("aggregate", aggregate)
    g.add_node("classify", classify_node)
    g.add_node("finalize", finalize)
    g.add_node("enrich", enrich)

    g.add_edge(START, "load")
    g.add_edge("load", "analyze_documents")
    g.add_edge("analyze_documents", "aggregate")
    g.add_edge("aggregate", "classify")
    g.add_edge("classify", "finalize")
    g.add_edge("finalize", "enrich")
    g.add_edge("enrich", END)
    return g.compile()


_APP = _build_graph()


# --- entry points -------------------------------------------------------------

def run_documents(documents: list[Document], package_id: str = "package") -> dict[str, Any]:
    """Classify already-built Document objects; return the full result state."""
    logger.info("Classifying package '%s' (%d document(s)).", package_id, len(documents))
    return _APP.invoke({"documents": documents, "package_id": package_id})


def run_package(path: str) -> dict[str, Any]:
    """Load a directory/file from disk and classify it."""
    package_id, documents = load_package(path)
    return run_documents(documents, package_id)


def _to_document(raw: dict, index: int) -> Document:
    """Build a Document from an inline event entry; infer modality if absent."""
    file_name = raw.get("file_name", f"doc_{index + 1}")
    ext = os.path.splitext(file_name)[1].lower()
    modality = raw.get("modality") or taxonomy.get().modality_for_extension(ext)
    text = raw.get("text", "")
    return Document(
        doc_id=raw.get("doc_id", f"doc_{index + 1}"),
        file_name=file_name, modality=modality, text=text,
        lines=raw.get("lines") or text.splitlines(),
        key_values=raw.get("key_values") or [],
        table_count=raw.get("table_count", 0),
        page_count=raw.get("page_count", 1),
    )


def classify(event: dict) -> dict[str, Any]:
    """Dispatch an event dict to the pipeline.

    Documents inline (preferred for Lambda — text is whatever upstream OCR
    produced):
        {"package_id": "...", "documents": [{"file_name": ..., "text": ...}, ...]}
    Or a path bundled with the deployment / present on disk:
        {"package_path": "data/sample_submission"}
    """
    event = event or {}
    if event.get("documents"):
        docs = [_to_document(d, i) for i, d in enumerate(event["documents"])]
        return run_documents(docs, event.get("package_id", "package"))
    if event.get("package_path"):
        return run_package(event["package_path"])
    raise ValueError("event must include 'documents' (inline) or 'package_path'.")
