# Document Classification Engine (AWS Lambda)

A **LangGraph-orchestrated**, **configurable** document-classification engine
that runs as an **AWS Lambda**. It classifies a *package* of documents (email +
PDF/Textract + Excel) using ten small agents on **Claude via Amazon Bedrock**,
plus deterministic **rules** you can register to short-circuit a step.

The engine code is **generic** — all domain specifics live in
[`config/taxonomy.yaml`](config/taxonomy.yaml) and
[`prompts.py`](src/classifier/prompts.py). Swap those and the same engine
classifies a different domain.

---

## Contents
- [The ten agents](#the-ten-agents)
- [How it runs](#how-it-runs)
- [Lambda usage](#lambda-usage)
- [Project layout](#project-layout)
- [Install & local test](#install--local-test)
- [Configure](#configure)
- [Settings reference](#settings-reference)
- [Extending (no core changes)](#extending-no-core-changes)
- [Output shape](#output-shape)
- [Logging](#logging)
- [Testing](#testing)

---

## The ten agents

All ten are plain functions in [`agents.py`](src/classifier/agents.py) — read
that one file to understand the whole logic. No generic dispatcher, no opaque
payloads: each agent takes real, named arguments and returns a typed result.

| # | Agent function | What it does |
|---|---|---|
| 1 | `load_package` (loaders.py) | load documents, assign modality |
| 2 | `identify_document` | identify the document type |
| 3 | `extract_keywords` | keyword evidence |
| 4 | `analyze_meaning` | semantic meaning |
| 5 | `detect_structure` | layout / template |
| 6 | `merge_evidence` | merge the per-document evidence |
| 7 | `aggregate` (pipeline.py) | aggregate package evidence |
| 8 | `predict_use_case` | predict use case (only if a modality enables it) |
| 9 | `predict_lob` | predict line of business |
| 10 | `finalize_decision` | validate and produce the final decision |

Each LLM agent runs two steps via one helper (`_decide`): **your override (a
registered rule) → Claude on Bedrock**. Each result carries a `rationale`, and
the engine collects these into a `reasoning` block in the output.

## How it runs

A simple, linear LangGraph ([`pipeline.py`](src/classifier/pipeline.py)):

```
load -> analyze_documents -> aggregate -> classify -> finalize -> enrich
```

`analyze_documents` loops over the documents, running agents 2–6 on each. (Plain
loop for clarity; to parallelize, swap it for a thread pool.)

**Modality decides the heads.** Each document's extension maps to a modality that
selects (a) the document-type set and (b) which classification heads run:

| Modality | Extensions | Doc-type set | Heads that run |
|---|---|---|---|
| email | `.eml`, `.txt` | standard | document type + LOB + **use case** |
| pdf | `.json`, `.pdf` | standard | document type + LOB |
| excel | `.xlsx`, `.xlsm` | **excel (separate set)** | document type + LOB |

Heads are the union across modalities present (email present → use case runs;
PDF-only or Excel-only → no use case).

---

## Lambda usage

Handler entry point: **`classifier.handler.handler`**

The event provides documents **inline** (preferred — `text` is whatever your
upstream OCR/Textract produced), or a **path** bundled with the deployment.

```jsonc
// inline (see events/inline_email_pdf.json)
{
  "package_id": "ACME-2026-001",
  "documents": [
    {"file_name": "broker.eml",     "modality": "email", "text": "..."},
    {"file_name": "loss_run.json",  "modality": "pdf",   "text": "..."},
    {"file_name": "sov.xlsx",       "modality": "excel", "text": "...", "table_count": 1}
  ]
}

// or a bundled path (see events/local_path.json)
{ "package_path": "data/sample_submission" }
```

`modality` is optional — if omitted it's inferred from the file extension. The
handler returns the classification result (JSON-serializable).

**Sample test events** are in [`events/`](events/) — paste one into the Lambda
console "Test" tab.

### Deploy notes
- Package `src/classifier`, `config/`, and dependencies into the Lambda (zip or
  container image).
- Set environment variables (see [Settings reference](#settings-reference)) and
  give the execution role `bedrock:InvokeModel` for your model/profile.
- Bump the function timeout/memory — agents make several Bedrock calls.

---

## Project layout

```
config/
  settings.yaml        how it runs (Bedrock model profile, logging, plugins)
  taxonomy.yaml        what it classifies (doc types, Excel types, heads, modalities)
events/                sample Lambda test events
data/
  sample_submission/   sample package (email + Textract JSON)
  make_samples.py      generates an Excel-only sample
docs/
  CUSTOM_FUNCTIONS.md  how to add overrides & enrichers
src/classifier/
  handler.py           AWS Lambda entry point
  agents.py            the 10 agents  ← start here
  pipeline.py          LangGraph wiring + classify()/run_*()
  llm.py               one Claude(Bedrock) call with structured output
  prompts.py           all prompt text (domain lives here)
  schemas.py           output models
  models.py            Document
  loaders.py           parse .json/.xlsx/.eml/.txt -> Document
  taxonomy.py          load config/taxonomy.yaml
  settings.py          load config/settings.yaml
  rules.py             custom overrides (skip the LLM)
  example_rules.py
  enrichers.py         custom output keys
  example_enrichers.py
  logging_setup.py  __init__.py
tests/test_graph.py
```

Flat — no nested packages. Each file has one job.

---

## Install & local test

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .            # or: pip install -r requirements.txt
```

Run the tests, which stub the Bedrock call so they execute without AWS:

```bash
python tests/test_graph.py        # or: pytest -q
```

To run against real Bedrock, configure AWS credentials + `bedrock:InvokeModel`,
then invoke the handler with one of the events in `events/`:

```bash
python -c "
import json
from classifier.handler import handler
print(json.dumps(handler(json.load(open('events/inline_email_pdf.json'))), indent=2, default=str))
"
```

Programmatic use:

```python
from classifier import classify
result = classify({"package_path": "data/sample_submission"})
print(result["final_decision"]["primary_lob"], result["enrichment"])
```

---

## Configure

Two YAML files under `config/`:

- **`config/settings.yaml`** — *how it runs*: Bedrock **model profile id**,
  region, logging, plugin modules.
- **`config/taxonomy.yaml`** — *what it classifies*: document types (standard +
  separate Excel set), lines of business, use cases, modalities.

### Amazon Bedrock
Auth uses the standard AWS chain (in Lambda, the execution role). Set
`bedrock.model_profile_id` to the exact model id / inference profile enabled for
your account/region (or `CLASSIFIER_MODEL`).

---

## Settings reference

Everything in `config/settings.yaml`; each has an env override (env wins) — set
these as Lambda environment variables.

| Setting | Env | Default | Meaning |
|---|---|---|---|
| `log_level` | `CLASSIFIER_LOG_LEVEL` | `INFO` | DEBUG/INFO/WARNING/ERROR |
| `bedrock.region` | `AWS_REGION` | `us-east-1` | Bedrock region |
| `bedrock.model_profile_id` | `CLASSIFIER_MODEL` | `us.anthropic.claude-opus-4-8` | default model |
| `bedrock.agent_models.<name>` | `CLASSIFIER_MODEL_<NAME>` | — | per-agent model (name = agent function) |
| `paths.taxonomy` | `CLASSIFIER_TAXONOMY` | `config/taxonomy.yaml` | taxonomy file |
| `plugins.rules_module` | `CLASSIFIER_RULES_MODULE` | — | custom overrides module |
| `plugins.enrichers_module` | `CLASSIFIER_ENRICHERS_MODULE` | `classifier.example_enrichers` | output enrichers |

---

## Extending (no core changes)

**Add a document type / Excel type / LOB / use case** — edit
`config/taxonomy.yaml`. Each entry has a `name`, a `description` (injected into
the prompts), and optional `keywords` / `expected_documents`. The name becomes an
allowed value in every agent's structured output automatically.

**Add a custom function that skips the LLM, or add custom output keys** — see
**[docs/CUSTOM_FUNCTIONS.md](docs/CUSTOM_FUNCTIONS.md)**. Register a function
under an agent's name; it receives that agent's own arguments and, if it returns
a result, the LLM is skipped. Enrichers add keys to the output.

Example — decide the use case from the email subject, else fall back to the LLM
(document types and LOB are still classified by the LLM):

```python
from classifier.rules import rule
from classifier import schemas

@rule("predict_use_case")
def use_case_from_email_subject(summary):
    subjects = " ".join(summary.get("email_subjects", [])).lower()
    if "renewal" in subjects:
        return schemas.UseCase(use_case="Renewal", confidence=0.99,
                               rationale="subject matched 'renewal'", alternatives=[])
    return None        # no match -> the LLM classifies the use case
```

Enable it: `CLASSIFIER_RULES_MODULE=classifier.example_rules` (the bundled sample
implements exactly this). The rule's `rationale` is stored in the output.

---

## Output shape

`classify(event)` / the handler return:

```jsonc
{
  "package_id": "ACME-2026-001",
  "modalities": ["email", "pdf"],
  "enabled_heads": ["document_type", "lob", "use_case"],
  "evidence": [ { "final_doc_type": "Loss Run", "rationale": "...", "lob_signals": [...], ... } ],
  "summary": { "doc_type_counts": {...}, "lob_tally": {...}, "email_subjects": [...] },
  "use_case": { "use_case": "New Business", "confidence": 0.99, "rationale": "subject matched 'new business'" },
  "lob": { "primary_lob": "Commercial Property", "rationale": "...", ... },
  "final_decision": {
    "primary_lob": "Commercial Property",
    "use_case": "New Business",
    "document_inventory": ["ACORD Application x1", ...],
    "overall_confidence": 0.7,
    "flags": [...],
    "recommended_routing": "...",
    "rationale": "..."
  },

  // why each thing was decided — collected for auditing:
  "reasoning": {
    "use_case": "Email subject matched 'new business' -> New Business (subject rule).",
    "lob": "package signals point to Commercial Property",
    "documents": [
      {"file_name": "loss_run.json", "doc_type": "Loss Run", "rationale": "..."},
      {"file_name": "sov.xlsx", "doc_type": "Statement of Values (SOV)", "rationale": "..."}
    ],
    "overall": "..."
  },

  "enrichment":    { "triage_priority": "medium", "insured_name": "ACME ...", ... },
  "enrichment_by": { "triage": {...}, "insured": {...}, "completeness": {...} }
}
```

The `reasoning` block records **why the use case, each document type, and the LOB
were decided** — whether by a rule or by the LLM. (The raw loaded documents are
omitted from the handler response.)

---

## Logging

No `print` statements — everything uses the standard `logging` module
(`logging_setup.py`). In Lambda the runtime captures it; locally it goes to
stderr. Set the level via `log_level` / `CLASSIFIER_LOG_LEVEL`.

---

## Testing

```bash
pip install pytest
pytest -q                 # or: python tests/test_graph.py
```

Tests stub the Bedrock call and cover modality assignment, head gating, the separate Excel
classes, the Lambda handler, an override skipping the LLM, enrichment, and a
brand-new YAML category with no code change.
