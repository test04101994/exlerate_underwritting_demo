"""The Document object that flows through the pipeline.

A plain dataclass with named fields so it's obvious what each agent receives —
no opaque dictionaries.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Document:
    doc_id: str
    file_name: str
    text: str
    modality: str               # "email" | "pdf" | "excel" | ...
    lines: list[str] = field(default_factory=list)
    key_values: list[str] = field(default_factory=list)
    table_count: int = 0
    page_count: int = 1
    # filled in by identify_document:
    doc_type: str = ""
    doc_type_confidence: float = 0.0
