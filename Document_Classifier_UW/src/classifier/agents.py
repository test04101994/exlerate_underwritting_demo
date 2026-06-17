"""The ten agents — one plain function each.

Open this file to understand the whole classification logic. Every agent does
two things, via the small ``_decide`` helper:

  1. custom rule — if you registered an override for this agent, use its result
                   (the LLM is skipped). See rules.py.
  2. the LLM     — otherwise call Claude on Bedrock with structured output.

Each agent takes real, named arguments (a Document, or the aggregated summary
dict) and returns a typed schema object that carries a ``rationale``.
"""

from __future__ import annotations

import logging

from . import llm, prompts, rules, schemas, taxonomy
from .models import Document
from .settings import get_settings

logger = logging.getLogger(__name__)


def _decide(name, args, *, schema, system, user,
            doc_types=None, max_tokens=2048, thinking=False):
    """Run a registered rule first; if none returns a result, call the LLM.

    ``args`` are passed to the rule; ``name`` is the agent's name (used for the
    rule lookup and the per-agent model override)."""
    override = rules.run(name, *args)
    if override is not None:
        return override
    return llm.call_claude(schema, system, user,
                           model=get_settings().model_for(name),
                           doc_types=doc_types, max_tokens=max_tokens, thinking=thinking)


def _doc_types(modality: str) -> list[str]:
    return taxonomy.get().doc_types_for(modality)


# --- per-document agents ------------------------------------------------------

def identify_document(doc: Document) -> schemas.DocType:
    return _decide("identify_document", (doc,),
                   schema=schemas.DocType,
                   system=prompts.identify_system(doc.modality),
                   user=prompts.identify_user(doc),
                   doc_types=_doc_types(doc.modality), max_tokens=1024)


def extract_keywords(doc: Document) -> schemas.Keywords:
    return _decide("extract_keywords", (doc,),
                   schema=schemas.Keywords,
                   system=prompts.keywords_system(doc.modality),
                   user=prompts.keywords_user(doc),
                   doc_types=_doc_types(doc.modality), max_tokens=1536)


def analyze_meaning(doc: Document) -> schemas.Meaning:
    return _decide("analyze_meaning", (doc,),
                   schema=schemas.Meaning,
                   system=prompts.meaning_system(doc.modality),
                   user=prompts.meaning_user(doc),
                   doc_types=_doc_types(doc.modality), max_tokens=2048)


def detect_structure(doc: Document) -> schemas.Structure:
    return _decide("detect_structure", (doc,),
                   schema=schemas.Structure,
                   system=prompts.structure_system(doc.modality),
                   user=prompts.structure_user(doc),
                   doc_types=_doc_types(doc.modality), max_tokens=1536)


def merge_evidence(doc, kw, se, st) -> schemas.DocumentEvidence:
    return _decide("merge_evidence", (doc, kw, se, st),
                   schema=schemas.DocumentEvidence,
                   system=prompts.merge_system(doc.modality),
                   user=prompts.merge_user(doc, kw, se, st),
                   doc_types=_doc_types(doc.modality), max_tokens=2048)


# --- package-level agents -----------------------------------------------------

def predict_use_case(summary: dict) -> schemas.UseCase:
    return _decide("predict_use_case", (summary,),
                   schema=schemas.UseCase, system=prompts.use_case_system(),
                   user=prompts.use_case_user(summary), max_tokens=6000, thinking=True)


def predict_lob(summary: dict) -> schemas.LOB:
    return _decide("predict_lob", (summary,),
                   schema=schemas.LOB, system=prompts.lob_system(),
                   user=prompts.lob_user(summary), max_tokens=6000, thinking=True)


def finalize_decision(summary, use_case, lob, use_case_applicable) -> schemas.Decision:
    return _decide("finalize_decision", (summary, use_case, lob, use_case_applicable),
                   schema=schemas.Decision, system=prompts.final_system(),
                   user=prompts.final_user(summary, use_case, lob, use_case_applicable),
                   max_tokens=8000, thinking=True)
