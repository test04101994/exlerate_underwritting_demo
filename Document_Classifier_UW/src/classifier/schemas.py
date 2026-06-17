"""The structured output each agent returns.

Controlled-vocabulary fields are plain strings here; the allowed values (enums)
are filled in at call time from the YAML taxonomy (see llm.py). That's what lets
you add new document types / LOBs / use cases with no code change.
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class DocType(BaseModel):
    """Output of identify_document."""
    doc_type: str = Field(description="Best-guess document type (a taxonomy value).")
    confidence: float = Field(description="0.0-1.0")
    rationale: str = Field(description="One sentence why.")


class Keywords(BaseModel):
    """Output of extract_keywords."""
    matched_keywords: List[str]
    doc_type_signal: str
    lob_signals: List[str]
    use_case_signals: List[str]
    confidence: float
    notes: str


class Meaning(BaseModel):
    """Output of analyze_meaning (semantic)."""
    summary: str
    inferred_purpose: str
    entities: List[str] = Field(description="'field=value', e.g. 'insured_name=ACME'.")
    doc_type_signal: str
    lob_signals: List[str]
    use_case_signals: List[str]
    confidence: float


class Structure(BaseModel):
    """Output of detect_structure."""
    layout_type: str = Field(description="form | table | letter | report | mixed")
    detected_sections: List[str]
    extracted_fields: List[str]
    doc_type_signal: str
    confidence: float


class DocumentEvidence(BaseModel):
    """Output of merge_evidence (one consolidated assessment per document)."""
    final_doc_type: str
    doc_type_confidence: float
    rationale: str = Field(description="Why this final document type was chosen.")
    lob_signals: List[str]
    use_case_signals: List[str]
    key_entities: List[str]
    completeness_notes: str


class UseCase(BaseModel):
    """Output of predict_use_case."""
    use_case: str
    confidence: float
    rationale: str
    alternatives: List[str]


class LOB(BaseModel):
    """Output of predict_lob."""
    primary_lob: str
    additional_lobs: List[str]
    confidence: float
    rationale: str


class Decision(BaseModel):
    """Output of finalize_decision (the package-level result)."""
    primary_lob: str
    use_case: str
    document_inventory: List[str]
    overall_confidence: float
    flags: List[str]
    recommended_routing: str
    rationale: str
