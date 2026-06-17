"""All prompt text in one place — built from the live taxonomy.

Each agent has a ``*_system`` (instructions + catalog) and a ``*_user`` (the
specific document/package) builder. Per-document prompts take the document's
modality so the document-type catalog is the right set (Excel docs see Excel
classes).
"""

from __future__ import annotations

import json

from . import taxonomy
from .models import Document

MAX_CHARS = 6000  # how much document text to send to the model


def _bullets(names, desc):
    return "\n".join(f"- {n}: {desc.get(n, '').strip()}" for n in names)


def _doc_catalog(modality):
    t = taxonomy.get()
    return _bullets(t.doc_types_for(modality), t.doc_descriptions_for(modality))


def _lob_catalog():
    t = taxonomy.get()
    return _bullets(t.lobs, t.lob_descriptions)


def _uc_catalog():
    t = taxonomy.get()
    return _bullets(t.use_cases, t.use_case_descriptions)


# --- identify_document --------------------------------------------------------

def identify_system(modality: str) -> str:
    return (
        f"You identify the type of a '{modality}' document in a commercial P&C "
        "insurance submission. Choose the single best type from the catalog.\n\n"
        f"DOCUMENT TYPES:\n{_doc_catalog(modality)}\n\n"
        "Use the catalog's 'Other / Unclassified' value only if nothing fits."
    )


def identify_user(doc: Document) -> str:
    return (f"File: {doc.file_name} | Modality: {doc.modality} | "
            f"Pages: {doc.page_count} | Tables: {doc.table_count}\n"
            f"--- TEXT ---\n{doc.text[:MAX_CHARS]}")


# --- extract_keywords ---------------------------------------------------------

def keywords_system(modality: str) -> str:
    return (
        "You are the Keyword agent. Find domain trigger terms and map them to "
        "the catalogs. Only report keywords that actually appear.\n\n"
        f"DOCUMENT TYPES:\n{_doc_catalog(modality)}\n\n"
        f"LINES OF BUSINESS:\n{_lob_catalog()}\n\n"
        f"USE CASES:\n{_uc_catalog()}"
    )


def keywords_user(doc: Document) -> str:
    return (f"Provisional type: {doc.doc_type or '(none yet)'}\n"
            f"--- TEXT ---\n{doc.text[:MAX_CHARS]}")


# --- analyze_meaning (semantic) ----------------------------------------------

def meaning_system(modality: str) -> str:
    return (
        "You are the Semantic agent. Summarize the document, infer why it's in "
        "the submission, and extract key entities as 'field=value'.\n\n"
        f"DOCUMENT TYPES:\n{_doc_catalog(modality)}\n\n"
        f"LINES OF BUSINESS:\n{_lob_catalog()}\n\n"
        f"USE CASES:\n{_uc_catalog()}"
    )


def meaning_user(doc: Document) -> str:
    return (f"File: {doc.file_name} | Provisional type: {doc.doc_type or '(none yet)'}\n"
            f"--- TEXT ---\n{doc.text[:MAX_CHARS]}")


# --- detect_structure ---------------------------------------------------------

def structure_system(modality: str) -> str:
    extra = " For Excel, each sheet is a table; use sheet names and headers." \
        if modality == "excel" else ""
    return (
        "You are the Structure agent. Use layout — forms, tables, key/value "
        f"pairs, headings/columns — to infer the type and pull fields.{extra}\n\n"
        f"DOCUMENT TYPES:\n{_doc_catalog(modality)}\n\n"
        "Set layout_type to one of: form, table, letter, report, mixed."
    )


def structure_user(doc: Document) -> str:
    kv = doc.key_values or []
    return (f"Provisional type: {doc.doc_type or '(none yet)'}\n"
            f"Table/sheet count: {doc.table_count}\n"
            f"Key/value (or columns):\n" + ("\n".join(kv[:30]) or "(none)") + "\n"
            f"--- LINES ---\n" + "\n".join((doc.lines or [])[:120]))


# --- merge_evidence -----------------------------------------------------------

def merge_system(modality: str) -> str:
    return (
        "You merge three assessments (keyword, semantic, structure) of the SAME "
        "document into one. Pick the final type, union the LOB and use-case "
        "signals, keep the key entities, note anything incomplete, and explain in "
        "'rationale' WHY you chose the final document type.\n\n"
        f"DOCUMENT TYPES:\n{_doc_catalog(modality)}\n\n"
        f"LINES OF BUSINESS:\n{_lob_catalog()}\n\n"
        f"USE CASES:\n{_uc_catalog()}"
    )


def merge_user(doc: Document, kw, se, st) -> str:
    return (
        f"Document: {doc.file_name} (provisional {doc.doc_type or '(none)'})\n\n"
        "Keyword:\n" + json.dumps(kw.model_dump(), indent=2) + "\n\n"
        "Semantic:\n" + json.dumps(se.model_dump(), indent=2) + "\n\n"
        "Structure:\n" + json.dumps(st.model_dump(), indent=2) + "\n\n"
        "Reconcile into one consolidated assessment."
    )


# --- predict_use_case / predict_lob ------------------------------------------

def use_case_system() -> str:
    return ("From the aggregated package summary, determine the underwriting use "
            f"case (intent).\n\nUSE CASES:\n{_uc_catalog()}")


def use_case_user(summary: dict) -> str:
    return (json.dumps(summary, indent=2)
            + "\n\nDetermine the use case for this submission.")


def lob_system() -> str:
    return ("From the aggregated package summary, determine the line(s) of "
            "business: one primary plus any additional.\n\n"
            f"LINES OF BUSINESS:\n{_lob_catalog()}")


def lob_user(summary: dict) -> str:
    return (json.dumps(summary, indent=2)
            + "\n\nDetermine the line(s) of business.")


# --- finalize_decision --------------------------------------------------------

def final_system() -> str:
    t = taxonomy.get()
    expected = "\n".join(
        f"- {uc}: " + (", ".join(t.use_case_expected_documents.get(uc, []))
                       or "(no specific expectations)")
        for uc in t.use_cases)
    return (
        "You produce the final routing decision for a fully autonomous "
        "underwriting intake system (no human review). Reconcile the agents, "
        "flag missing expected documents, set overall confidence, and recommend "
        "a queue. If use_case was not classified for this modality, set it to "
        "'Unknown' and note that in flags.\n\n"
        f"LINES OF BUSINESS:\n{_lob_catalog()}\n\n"
        f"USE CASES:\n{_uc_catalog()}\n\n"
        f"EXPECTED DOCUMENTS PER USE CASE:\n{expected}"
    )


def final_user(summary: dict, use_case: dict, lob: dict, use_case_applicable: bool) -> str:
    return (
        "Package summary:\n" + json.dumps(summary, indent=2)
        + f"\n\nUse case classified for this modality: {use_case_applicable}"
        + "\n\nUse case result:\n" + json.dumps(use_case, indent=2)
        + "\n\nLOB result:\n" + json.dumps(lob, indent=2)
        + "\n\nProduce the final decision."
    )
