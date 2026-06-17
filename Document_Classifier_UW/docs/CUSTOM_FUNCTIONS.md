# Custom Functions — Overrides (skip the LLM) & Enrichers (add output keys)

Two ways to plug in your own Python, **without changing core code**:

1. **Overrides (rules)** — classify one step yourself; that step skips the LLM.
2. **Enrichers** — add custom keys to the final result.

There is **no `kind` and no payload dictionary**. You register a function under
an **agent's name**, and it receives the **exact same arguments that agent
receives**.

---

## The ten agents (names + arguments)

All agents live in `src/classifier/agents.py`. Register an override using the
function name on the left; your function gets the arguments on the right and
returns the schema on the far right (from `classifier.schemas`).

| Agent name | Your function receives | Return this schema |
|---|---|---|
| `identify_document` | `doc: Document` | `schemas.DocType` |
| `extract_keywords` | `doc: Document` | `schemas.Keywords` |
| `analyze_meaning` | `doc: Document` | `schemas.Meaning` |
| `detect_structure` | `doc: Document` | `schemas.Structure` |
| `merge_evidence` | `doc, kw, se, st` | `schemas.DocumentEvidence` |
| `predict_use_case` | `summary: dict` | `schemas.UseCase` |
| `predict_lob` | `summary: dict` | `schemas.LOB` |
| `finalize_decision` | `summary, use_case, lob, use_case_applicable` | `schemas.Decision` |

`Document` (see `models.py`) has named fields — no guessing:
`doc_id, file_name, text, modality, lines, key_values, table_count, page_count,
doc_type, doc_type_confidence`.

`summary` is the aggregated dict: `document_count, doc_type_counts, lob_tally,
use_case_tally, entities, modalities, enabled_heads, documents,
email_subjects` (subject lines of any emails), and `policy_refs` (policy
references like `PH3123131` found anywhere — subject, body, or attachment).

---

## How an override skips the LLM

Each agent runs two steps (in `agents._decide`):

```
your override (rules.run)   --> returns a result?  --> USE IT  (LLM not called)
        |  returns None
call Claude on Bedrock      (structured output)
```

So an override **wins** for that step. If it returns `None`, the agent classifies
with the LLM as normal.

---

## Write an override

```python
# my_rules.py
from classifier.rules import rule
from classifier import schemas


# Decide the USE CASE from the email subject; otherwise let the LLM classify it.
# The aggregated summary carries every email's subject in `email_subjects`.
@rule("predict_use_case")
def use_case_from_email_subject(summary):
    subjects = " ".join(summary.get("email_subjects", [])).lower()
    if not subjects:
        return None                      # no email -> let the LLM decide
    for keyword, use_case in [("renewal", "Renewal"),
                              ("endorsement", "Endorsement"),
                              ("new business", "New Business")]:
        if keyword in subjects:
            return schemas.UseCase(
                use_case=use_case, confidence=0.99,
                rationale=f"Email subject matched '{keyword}' -> {use_case} (rule).",
                alternatives=[])
    return None                          # subject didn't match -> let the LLM decide


@rule("identify_document")               # an agent name from the table above
def bordereau_by_filename(doc):          # same arg the agent gets (a Document)
    if doc.modality == "excel" and "bordereau" in doc.file_name.lower():
        return schemas.DocType(          # -> skip the LLM for this document
            doc_type="Premium Bordereau", confidence=0.99, rationale="filename rule")
    return None                          # -> let the LLM handle it


# Decide the LOB from a policy reference found ANYWHERE (subject/body/attachment).
# `policy_refs` holds e.g. ["PH3123131"]; the leading letters are the prefix.
import re
_PREFIX_LOB = {"PH": "Commercial Property", "GL": "General Liability", "WC": "Workers Compensation"}

@rule("predict_lob")
def lob_from_policy_reference(summary):
    for ref in summary.get("policy_refs", []):
        prefix = re.match(r"[A-Za-z]+", ref).group(0).upper()
        if prefix in _PREFIX_LOB:
            return schemas.LOB(primary_lob=_PREFIX_LOB[prefix], additional_lobs=[],
                               confidence=0.99,
                               rationale=f"Policy ref '{ref}' prefix '{prefix}' -> {_PREFIX_LOB[prefix]}")
    return None                          # no known prefix -> let the LLM decide
```

> Document types (`identify_document`) and LOB (`predict_lob`) are still
> classified by the LLM unless you add overrides for them too — the use-case rule
> above only short-circuits the use-case step.

The reasoning you put in `rationale` is stored in the output (see the engine's
`reasoning` block), so a rule decision is auditable just like an LLM one.

- Return a `schemas.*` object **or** a dict with the same fields.
- Return `None` to fall through to the LLM.
- Multiple overrides for the same agent run in registration order; the first
  non-`None` wins.
- An override that raises is logged and skipped (never breaks a run).

> The values you return for document type / LOB / use case must be valid
> taxonomy names. With the LLM these are enforced by the schema enum; in an
> override you are responsible for returning a valid value.

## Register it

Point the system at your module — it's imported automatically (the decorators
run on import):

```yaml
# config/settings.yaml
plugins:
  rules_module: my_rules
```

or via env (wins over the file):

```bash
export CLASSIFIER_RULES_MODULE=my_rules     # Lambda: set as an environment variable
```

A working sample lives at `classifier.example_rules`. For tests you can also
register directly: `rules.register("predict_lob", fn)` (and `rules.reset()`).

## Verify it skipped the LLM

Set `CLASSIFIER_LOG_LEVEL=DEBUG` and look for this line in the logs (CloudWatch
in Lambda, stderr locally):

```
DEBUG classifier.rules: Rule 'use_case_from_email_subject' handled predict_use_case (LLM skipped).
```

The result's `reasoning` block will also show the rule's rationale, so you can
confirm the decision came from your rule and not the model.

---

## Enrichers — add custom keys to the output

Same idea, but they run **after** the decision and add information to the result.

```python
# my_enrichers.py
from classifier.enrichers import enricher


@enricher("sla")
def sla(result):                         # the full result dict
    decision = result["final_decision"]
    if decision["primary_lob"] != "Cyber Liability":
        return None                      # only add for some cases
    return {"sla_hours": 4, "needs_specialist": True}
```

`result` contains `submission_id, modalities, enabled_heads, evidence, summary,
use_case, lob, final_decision`. Return a dict of keys, or `None`.

Register with `plugins.enrichers_module` (default points at the bundled
`classifier.example_enrichers`) or `CLASSIFIER_ENRICHERS_MODULE`. The output appears as:

```jsonc
"enrichment":    { "sla_hours": 4, "needs_specialist": true, ... },   // flat
"enrichment_by": { "sla": { "sla_hours": 4, "needs_specialist": true } } // grouped
```

---

## Cheat sheet

| | Override (rule) | Enricher |
|---|---|---|
| Register | `@rule("<agent_name>")` | `@enricher("<name>")` |
| Receives | the agent's own arguments | the full result dict |
| Return to act | schema object or dict | dict of keys |
| Return to skip | `None` (agent runs normally) | `None` (adds nothing) |
| Runs | before the model (override → Bedrock) | after `finalize` |
| Module setting | `plugins.rules_module` / `CLASSIFIER_RULES_MODULE` | `plugins.enrichers_module` / `CLASSIFIER_ENRICHERS_MODULE` |
| Sample | `example_rules.py` | `example_enrichers.py` |

Core files to read: `agents.py` (the agents + `_decide`), `rules.py`,
`enrichers.py`.
