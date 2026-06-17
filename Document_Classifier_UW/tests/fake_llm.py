"""A deterministic stand-in for the Bedrock call, used ONLY by the tests.

The product calls Claude on Bedrock (classifier.llm.call_claude). Tests patch
that function with this fake so they run offline without AWS. It derives plausible
results by keyword-matching the prompt text against the taxonomy — enough to make
the assertions meaningful. This is test scaffolding, not a product feature.
"""

from __future__ import annotations

from classifier import schemas, taxonomy


def _rank(text: str, mapping: dict[str, list[str]]) -> list[str]:
    t = (text or "").lower()
    scored = []
    for label, words in mapping.items():
        count = sum(t.count(w) for w in words if w)
        if count:
            scored.append((count, label))
    scored.sort(reverse=True)
    return [label for _, label in scored]


def _doc_map(doc_types):
    tax = taxonomy.get()
    out = {}
    for s in tax.doc_type_sets.values():
        for name, kws in s.keywords.items():
            if not doc_types or name in doc_types:
                out[name] = kws
    return out


def fake_call_claude(schema, system, user, *, model=None, doc_types=None,
                     max_tokens=2048, thinking=False):
    tax = taxonomy.get()
    docs = _doc_map(doc_types or [])

    def top_doc():
        r = _rank(user, docs)
        return r[0] if r else (doc_types[-1] if doc_types else "Other / Unclassified")

    def top_lobs(n=2):
        r = [x for x in _rank(user, tax.lob_keywords) if x != "Unknown"]
        return r[:n] or ["Unknown"]

    def top_ucs(n=2):
        return _rank(user, tax.use_case_keywords)[:n]

    if schema is schemas.DocType:
        dt = top_doc()
        return schemas.DocType(doc_type=dt, confidence=0.85,
                               rationale=f"keywords indicate {dt}")
    if schema is schemas.Keywords:
        return schemas.Keywords(matched_keywords=[], doc_type_signal=top_doc(),
                                lob_signals=top_lobs(), use_case_signals=top_ucs(1),
                                confidence=0.7, notes="fake")
    if schema is schemas.Meaning:
        return schemas.Meaning(summary="fake", inferred_purpose="fake", entities=[],
                               doc_type_signal=top_doc(), lob_signals=top_lobs(),
                               use_case_signals=top_ucs(1), confidence=0.7)
    if schema is schemas.Structure:
        layout = "table" if "[sheet]" in user.lower() else "report"
        return schemas.Structure(layout_type=layout, detected_sections=[],
                                 extracted_fields=[], doc_type_signal=top_doc(),
                                 confidence=0.6)
    if schema is schemas.DocumentEvidence:
        dt = top_doc()
        return schemas.DocumentEvidence(final_doc_type=dt, doc_type_confidence=0.85,
                                        rationale=f"all three agents point to {dt}",
                                        lob_signals=top_lobs(), use_case_signals=top_ucs(2),
                                        key_entities=[], completeness_notes="fake")
    if schema is schemas.UseCase:
        ucs = top_ucs(3)
        uc = ucs[0] if ucs else "Unknown"
        return schemas.UseCase(use_case=uc, confidence=0.7,
                               rationale=f"package signals point to {uc}",
                               alternatives=ucs[1:3])
    if schema is schemas.LOB:
        lobs = top_lobs(4)
        return schemas.LOB(primary_lob=lobs[0], additional_lobs=lobs[1:4],
                           confidence=0.7, rationale=f"package signals point to {lobs[0]}")
    if schema is schemas.Decision:
        lobs = top_lobs(1)
        ucs = top_ucs(1)
        return schemas.Decision(primary_lob=lobs[0], use_case=(ucs[0] if ucs else "Unknown"),
                                document_inventory=[], overall_confidence=0.7, flags=[],
                                recommended_routing="queue", rationale="overall reasoning")
    raise ValueError(f"fake_call_claude: unhandled schema {schema}")
