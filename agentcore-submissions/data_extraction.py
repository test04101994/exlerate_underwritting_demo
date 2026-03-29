"""
Data Extraction workflow (LangGraph + S3 persistence).
Extracts structured fields from PDFs using Nova Lite + PyMuPDF bounding boxes.

Pipeline: parse_pdf → extract_fields → validate → store_results
"""

import json
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from typing import TypedDict

import boto3
import fitz  # PyMuPDF
from botocore.exceptions import ClientError
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger("agentcore.extraction")

import settings as _settings

AWS_REGION = _settings.AWS_REGION
LLM_MODEL_ID = _settings.LLM_MODEL_ID
S3_BUCKET = _settings.S3_BUCKET
EXTRACTIONS_PREFIX = "extractions"

bedrock_runtime = _settings.bedrock_runtime
s3_client = _settings.s3_client

# Default extraction fields for insurance/underwriting
DEFAULT_FIELDS = [
    "insured_name",
    "policy_number",
    "effective_date",
    "expiration_date",
    "premium_amount",
    "coverage_limit",
    "deductible",
    "broker_name",
    "insured_address",
    "risk_description",
]


# ── State Types ──────────────────────────────────────────────────────────────


class ExtractedField(TypedDict):
    field_name: str
    value: str
    confidence: float
    page: int
    coordinates: list  # [x0, y0, x1, y1]
    field_status: str  # pending | approved | rejected
    correction: str
    section: str  # logical grouping e.g. "Policy Information", "Financial Details"
    group_index: int  # 1-based index for repeating groups (e.g., insured 1, insured 2)


class ExtractionState(TypedDict):
    extraction_id: str
    ticket_key: str
    s3_uri: str
    s3_key: str
    bucket: str
    raw_text: str
    page_texts: list  # [{page, text, words: [(x0,y0,x1,y1,word)...]}]
    extraction_fields: list
    extracted_data: list  # list of ExtractedField dicts
    status: str
    error: str
    created_at: str


# ── S3 Persistence ───────────────────────────────────────────────────────────


def save_extraction_state(state: dict) -> None:
    """Save extraction state to S3."""
    eid = state["extraction_id"]
    tk = state.get("ticket_key", "unknown")
    key = f"{EXTRACTIONS_PREFIX}/{tk}/{eid}.json"
    # Don't persist raw_text and page_texts (too large)
    persist = {k: v for k, v in state.items() if k not in ("raw_text", "page_texts")}
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(persist, default=str),
        ContentType="application/json",
    )
    logger.info(f"Saved extraction: s3://{S3_BUCKET}/{key}")


def load_extraction_state(extraction_id: str, ticket_key: str = "") -> dict | None:
    """Load extraction state from S3."""
    # Try with ticket_key first, then scan
    if ticket_key:
        key = f"{EXTRACTIONS_PREFIX}/{ticket_key}/{extraction_id}.json"
        try:
            resp = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
            return json.loads(resp["Body"].read().decode())
        except ClientError:
            pass

    # Scan all ticket folders
    try:
        resp = s3_client.list_objects_v2(Bucket=S3_BUCKET, Prefix=f"{EXTRACTIONS_PREFIX}/")
        for obj in resp.get("Contents", []):
            if extraction_id in obj["Key"]:
                data = s3_client.get_object(Bucket=S3_BUCKET, Key=obj["Key"])
                return json.loads(data["Body"].read().decode())
    except Exception as e:
        logger.error(f"Failed to find extraction {extraction_id}: {e}")
    return None


def list_extractions(ticket_key: str = "") -> list[dict]:
    """List all extractions for a ticket."""
    results = []
    prefix = f"{EXTRACTIONS_PREFIX}/{ticket_key}/" if ticket_key else f"{EXTRACTIONS_PREFIX}/"
    try:
        resp = s3_client.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        for obj in resp.get("Contents", []):
            try:
                data = s3_client.get_object(Bucket=S3_BUCKET, Key=obj["Key"])
                state = json.loads(data["Body"].read().decode())
                results.append(state)
            except Exception:
                continue
    except Exception as e:
        logger.error(f"Failed to list extractions: {e}")
    return results


# ── Helper: Bedrock call ─────────────────────────────────────────────────────


def _call_bedrock(system_prompt: str, user_prompt: str, max_tokens: int = 2000) -> str:
    resp = bedrock_runtime.converse(
        modelId=LLM_MODEL_ID,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        inferenceConfig={"maxTokens": max_tokens, "temperature": 0.1},
    )
    return resp["output"]["message"]["content"][0]["text"].strip()


# ── Helper: Find bounding box for a value in page words ──────────────────────


def _find_bbox(value: str, page_words: list) -> list | None:
    """
    Search for 'value' in the page's word list and return union bounding box.
    page_words: list of (x0, y0, x1, y1, word, ...) tuples from fitz.
    """
    if not value or not page_words:
        return None

    value_lower = value.lower().strip()
    value_words = value_lower.split()

    if not value_words:
        return None

    # Try to find a sequence of words matching the value
    word_texts = [w[4].lower() for w in page_words]

    for start_idx in range(len(word_texts)):
        # Check if value_words match starting at start_idx
        match = True
        matched_indices = []
        vi = 0
        for wi in range(start_idx, min(start_idx + len(value_words) * 2, len(word_texts))):
            if vi >= len(value_words):
                break
            if value_words[vi] in word_texts[wi] or word_texts[wi] in value_words[vi]:
                matched_indices.append(wi)
                vi += 1

        if vi >= len(value_words) and matched_indices:
            # Found a match — compute union bbox
            x0 = min(page_words[i][0] for i in matched_indices)
            y0 = min(page_words[i][1] for i in matched_indices)
            x1 = max(page_words[i][2] for i in matched_indices)
            y1 = max(page_words[i][3] for i in matched_indices)
            return [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)]

    # Fallback: try substring match on first word
    first_word = value_words[0]
    for w in page_words:
        if first_word in w[4].lower():
            return [round(w[0], 1), round(w[1], 1), round(w[2], 1), round(w[3], 1)]

    return None


# ── LangGraph Nodes ──────────────────────────────────────────────────────────


def parse_pdf_node(state: ExtractionState) -> dict:
    """Node 1: Download PDF from S3 and extract text + word positions with PyMuPDF."""
    s3_key = state["s3_key"]
    bucket = state.get("bucket", S3_BUCKET)

    logger.info(f"[parse_pdf] Downloading s3://{bucket}/{s3_key}")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name
        s3_client.download_file(bucket, s3_key, tmp_path)

    try:
        doc = fitz.open(tmp_path)
        raw_text_parts = []
        page_texts = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            raw_text_parts.append(text)

            # Get per-word bounding boxes
            words = page.get_text("words")  # (x0, y0, x1, y1, word, block_no, line_no, word_no)
            word_data = [(w[0], w[1], w[2], w[3], w[4]) for w in words]

            page_texts.append({
                "page": page_num + 1,
                "text": text,
                "words": word_data,
                "width": page.rect.width,
                "height": page.rect.height,
            })

        doc.close()
        raw_text = "\n\n".join(raw_text_parts)

        logger.info(f"[parse_pdf] Parsed {len(page_texts)} pages, {len(raw_text)} chars")
        return {
            "raw_text": raw_text,
            "page_texts": page_texts,
            "status": "extracting",
        }
    finally:
        os.unlink(tmp_path)


def extract_fields_node(state: ExtractionState) -> dict:
    """Node 2: Use Nova Lite to extract field values, then find bounding boxes with fitz."""
    raw_text = state["raw_text"]
    fields = state.get("extraction_fields") or DEFAULT_FIELDS
    page_texts = state.get("page_texts", [])

    # Truncate text for LLM context window
    truncated = raw_text[:8000]

    field_list = ", ".join(fields)
    system = """You are a document data extraction expert. Extract the requested fields from the document text.
For each field, provide the exact value as it appears in the document, the text snippet where you found it,
and assign it to a logical section for grouping.

IMPORTANT: If the document contains MULTIPLE records/groups of the same type (e.g., multiple insured
parties, multiple coverage sections, multiple properties), extract each group separately using
group_index (1, 2, 3...). Fields in group 1 get group_index=1, fields in group 2 get group_index=2.
Fields that appear only once should have group_index=1.

Common sections: "Policy Information", "Parties & Contacts", "Dates", "Financial Details", "Coverage Details", "Property Details", "Claims History", "Additional Information"
Choose the most appropriate section for each field. Create new section names if needed.

Return ONLY valid JSON — no explanation, no markdown fences."""

    user_prompt = f"""Document text:
{truncated}

Extract these fields: {field_list}

IMPORTANT: If the document has multiple records of the same type (e.g., 3 insured parties),
use the SAME field_name but different group_index values (1, 2, 3).

Return a JSON array where each element is:
{{"field_name": "...", "value": "...", "source_snippet": "...", "page_hint": 1, "section": "...", "group_index": 1}}

If a field is not found, set value to "" and source_snippet to "".
Return ONLY the JSON array."""

    try:
        response = _call_bedrock(system, user_prompt, max_tokens=2000)
        # Parse JSON from response
        json_match = re.search(r'\[[\s\S]*\]', response)
        if json_match:
            extracted_raw = json.loads(json_match.group())
        else:
            logger.warning("[extract_fields] No JSON array found in LLM response")
            extracted_raw = []
    except Exception as e:
        logger.error(f"[extract_fields] LLM extraction failed: {e}")
        extracted_raw = []

    # Build ExtractedField list with real bounding boxes
    extracted_data = []
    for item in extracted_raw:
        field_name = item.get("field_name", "")
        value = item.get("value", "")
        source_snippet = item.get("source_snippet", "")
        page_hint = item.get("page_hint", 1)

        # Find bounding box by searching page words
        coordinates = [0, 0, 0, 0]
        found_page = page_hint
        search_text = value or source_snippet

        if search_text and page_texts:
            # Try the hinted page first
            for pt in page_texts:
                if pt["page"] == page_hint:
                    bbox = _find_bbox(search_text, pt["words"])
                    if bbox:
                        coordinates = bbox
                        found_page = pt["page"]
                        break

            # If not found on hinted page, search all pages
            if coordinates == [0, 0, 0, 0]:
                for pt in page_texts:
                    bbox = _find_bbox(search_text, pt["words"])
                    if bbox:
                        coordinates = bbox
                        found_page = pt["page"]
                        break

        confidence = 0.95 if value else 0.0
        if coordinates == [0, 0, 0, 0] and value:
            confidence = 0.7  # lower confidence if no bbox found

        extracted_data.append({
            "field_name": field_name,
            "value": value,
            "confidence": confidence,
            "page": found_page,
            "coordinates": coordinates,
            "field_status": "pending",
            "correction": "",
            "section": item.get("section", ""),
            "group_index": item.get("group_index", 1),
        })

    # Add any missing fields
    found_names = {f["field_name"] for f in extracted_data}
    for f in fields:
        if f not in found_names:
            extracted_data.append({
                "field_name": f,
                "value": "",
                "confidence": 0.0,
                "page": 1,
                "coordinates": [0, 0, 0, 0],
                "field_status": "pending",
                "correction": "",
                "section": "",
                "group_index": 1,
            })

    logger.info(f"[extract_fields] Extracted {len(extracted_data)} fields")
    return {"extracted_data": extracted_data, "status": "validating"}


def validate_node(state: ExtractionState) -> dict:
    """Node 3: Validate extracted fields — check dates, amounts, required fields."""
    data = state.get("extracted_data", [])

    date_fields = {"effective_date", "expiration_date"}
    amount_fields = {"premium_amount", "coverage_limit", "deductible"}
    required_fields = {"insured_name", "policy_number"}

    for field in data:
        name = field["field_name"]
        value = field["value"]

        # Required check
        if name in required_fields and not value:
            field["confidence"] = max(field["confidence"] - 0.3, 0.0)

        # Date validation
        if name in date_fields and value:
            # Check if it looks like a date
            date_patterns = [
                r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',
                r'\d{4}[/-]\d{1,2}[/-]\d{1,2}',
                r'\w+ \d{1,2},? \d{4}',
            ]
            if not any(re.search(p, value) for p in date_patterns):
                field["confidence"] = max(field["confidence"] - 0.15, 0.0)

        # Amount validation
        if name in amount_fields and value:
            cleaned = re.sub(r'[£$€,\s]', '', value)
            try:
                float(cleaned)
            except ValueError:
                field["confidence"] = max(field["confidence"] - 0.2, 0.0)

    logger.info("[validate] Validation complete")
    return {"extracted_data": data, "status": "pending_review"}


def store_results_node(state: ExtractionState) -> dict:
    """Node 4: Save final extraction results to S3."""
    save_extraction_state(state)
    logger.info(f"[store_results] Saved extraction {state['extraction_id']}")
    return {"status": "pending_review"}


# ── Graph Construction ───────────────────────────────────────────────────────


def _build_extraction_graph():
    graph = StateGraph(ExtractionState)
    graph.add_node("parse_pdf", parse_pdf_node)
    graph.add_node("extract_fields", extract_fields_node)
    graph.add_node("validate", validate_node)
    graph.add_node("store_results", store_results_node)
    graph.add_edge(START, "parse_pdf")
    graph.add_edge("parse_pdf", "extract_fields")
    graph.add_edge("extract_fields", "validate")
    graph.add_edge("validate", "store_results")
    graph.add_edge("store_results", END)
    return graph.compile()


_extraction_graph = _build_extraction_graph()


# ── Public API ───────────────────────────────────────────────────────────────


def run_extraction(
    s3_key: str,
    bucket: str = S3_BUCKET,
    ticket_key: str = "",
    fields: list | None = None,
) -> dict:
    """Run the full extraction pipeline on a PDF."""
    extraction_id = uuid.uuid4().hex[:8]
    s3_uri = f"s3://{bucket}/{s3_key}"

    initial_state: ExtractionState = {
        "extraction_id": extraction_id,
        "ticket_key": ticket_key,
        "s3_uri": s3_uri,
        "s3_key": s3_key,
        "bucket": bucket,
        "raw_text": "",
        "page_texts": [],
        "extraction_fields": fields or DEFAULT_FIELDS,
        "extracted_data": [],
        "status": "parsing",
        "error": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(f"Starting extraction {extraction_id} for {s3_uri}")
    result = _extraction_graph.invoke(initial_state)
    logger.info(f"Extraction {extraction_id} complete: {len(result.get('extracted_data', []))} fields")
    return result


def update_field_status(
    extraction_id: str,
    field_name: str,
    field_status: str,
    correction: str = "",
    ticket_key: str = "",
) -> dict | None:
    """Update status/correction for a single field."""
    state = load_extraction_state(extraction_id, ticket_key)
    if not state:
        return None
    for field in state.get("extracted_data", []):
        if field["field_name"] == field_name:
            field["field_status"] = field_status
            if correction:
                field["correction"] = correction
            break
    save_extraction_state(state)
    return state


def approve_extraction(extraction_id: str, ticket_key: str = "") -> dict | None:
    """Mark entire extraction as approved."""
    state = load_extraction_state(extraction_id, ticket_key)
    if not state:
        return None
    state["status"] = "approved"
    for field in state.get("extracted_data", []):
        if field["field_status"] == "pending":
            field["field_status"] = "approved"
    save_extraction_state(state)
    logger.info(f"Extraction {extraction_id} approved")
    return state


def reject_extraction(extraction_id: str, ticket_key: str = "") -> dict | None:
    """Mark entire extraction as rejected."""
    state = load_extraction_state(extraction_id, ticket_key)
    if not state:
        return None
    state["status"] = "rejected"
    save_extraction_state(state)
    logger.info(f"Extraction {extraction_id} rejected")
    return state
