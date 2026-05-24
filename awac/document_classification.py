"""FNOL PDF document classifier.

Recursively scans for ``.pdf`` files and uses AWS Bedrock Claude to
classify each into one of ten document categories
(FNOL & ACORD Forms, Policy & Endorsement Documents, Claim Correspondence
& Coverage Letters, Investigation & Inspection Reports, Financial & Loss
Documents, Medical & Injury Records, Legal & Litigation Documents, Cyber
Notice, Environmental Notice, Other). Writes results to an Excel workbook.

Fill in the AWS credential placeholders below before running.

PDF handling: reads the first ``PDF_PAGES`` pages; PDFs with fewer than
``MIN_PDF_CHARS`` extractable characters are treated as scanned and skipped.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

import boto3
import openpyxl
import pymupdf
from botocore.exceptions import BotoCoreError, ClientError
from tqdm import tqdm

# ─────────────────────────────────────────────────────────────
# AWS credentials (fill these in before running)
# WARNING: do not commit real credentials to source control.
# ─────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID: str = "<YOUR_AWS_ACCESS_KEY_ID>"
AWS_SECRET_ACCESS_KEY: str = "<YOUR_AWS_SECRET_ACCESS_KEY>"
AWS_SESSION_TOKEN: str = "<YOUR_AWS_SESSION_TOKEN>"
AWS_REGION: str = "us-east-1"

# ─────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────
INFERENCE_PROFILE_ID: str = "<YOUR_APPLICATION_INFERENCE_PROFILE_ID>"
OUTPUT_EXCEL: str = "document_classification_results.xlsx"

PDF_PAGES: int = 2
MIN_PDF_CHARS: int = 50
MAX_CONTENT_CHARS: int = 6000
MAX_OUTPUT_TOKENS: int = 300

SCANNED_SKIP_REASON: str = "Scanned PDF — no extractable text"

EXCLUDED_DIRS: frozenset[str] = frozenset({
    "__pycache__", ".git", ".venv", "venv", "env",
    ".idea", ".vscode", "node_modules",
})

JSON_FENCE_RE: re.Pattern[str] = re.compile(r"^```json|```$", re.MULTILINE)

EXCEL_HEADERS: tuple[str, ...] = (
    "File Path", "Document Type", "Confidence", "Reason",
)

SYSTEM_PROMPT: str = """You are an expert insurance document classifier working for Allied World Insurer.

You will receive content from a PDF document related to insurance claims.
Classify the document into exactly one of the following ten categories. Use the
exact category name (left-hand side, before the colon) as the value of
"document_type".

  - FNOL & ACORD Forms                       : First notice of loss in any format — ACORD forms (125, 25, 1, 3, 4, etc.), FNOL emails, and loss notice letters
  - Policy & Endorsement Documents           : Policies, declarations, binders, certificates of insurance, endorsements, riders, and coverage schedules
  - Claim Correspondence & Coverage Letters  : General claim emails/letters, status updates, Reservation of Rights, coverage denials, and coverage confirmations
  - Investigation & Inspection Reports       : Adjuster reports, SIU/fraud reports, police & authority reports, engineering/expert reports, property & vehicle inspections, witness and recorded statements, photographs
  - Financial & Loss Documents               : Repair estimates, contractor scopes, invoices, payment receipts, proof of loss, inventories, claim summaries, and reserve reports
  - Medical & Injury Records                 : Treatment records, IMEs, medical bills, disability evaluations, injury reports
  - Legal & Litigation Documents             : Attorney demand letters, lawsuit filings, summonses, subpoenas, court orders, discovery, settlements, releases, and subrogation correspondence
  - Cyber Notice                             : Cyber incident, data breach, ransomware, business email compromise, or privacy event notification
  - Environmental Notice                     : Environmental damage, pollution, contamination, spill, or remediation claim
  - Other                                    : Does not fit any category above (e.g., underwriting, billing, audit, general correspondence)

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "document_type": "<one of the category names above, copied exactly>",
  "confidence": "High" | "Medium" | "Low",
  "reason": "<2 concise lines max explaining your classification>"
}"""


logger = logging.getLogger("fnol_document_classifier")


# ─────────────────────────────────────────────────────────────
# Bedrock client
# ─────────────────────────────────────────────────────────────
def get_bedrock_client() -> Any:
    """Build a Bedrock runtime client from the credential constants above."""
    placeholders = {
        "AWS_ACCESS_KEY_ID": AWS_ACCESS_KEY_ID,
        "AWS_SECRET_ACCESS_KEY": AWS_SECRET_ACCESS_KEY,
        "AWS_SESSION_TOKEN": AWS_SESSION_TOKEN,
        "INFERENCE_PROFILE_ID": INFERENCE_PROFILE_ID,
    }
    unfilled = [name for name, value in placeholders.items()
                if not value or value.startswith("<")]
    if unfilled:
        raise ValueError(
            "Replace the placeholder(s) at the top of this file: "
            + ", ".join(unfilled)
        )

    return boto3.client(
        "bedrock-runtime",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        aws_session_token=AWS_SESSION_TOKEN,
    )


# ─────────────────────────────────────────────────────────────
# File discovery
# ─────────────────────────────────────────────────────────────
def discover_pdfs(root_dir: Path) -> list[Path]:
    """Return sorted ``.pdf`` paths under ``root_dir``, skipping hidden/excluded dirs."""
    found: list[Path] = []
    for current_dir, subdirs, files in os.walk(root_dir):
        subdirs[:] = [
            d for d in subdirs
            if d not in EXCLUDED_DIRS and not d.startswith(".")
        ]
        for filename in files:
            if filename.lower().endswith(".pdf"):
                found.append(Path(current_dir) / filename)
    return sorted(found)


# ─────────────────────────────────────────────────────────────
# PDF reader
# ─────────────────────────────────────────────────────────────
def read_pdf(filepath: Path) -> tuple[str, str]:
    """Return ``(content, skip_reason)`` for a PDF; scanned PDFs are skipped."""
    try:
        doc = pymupdf.open(str(filepath))
    except Exception as exc:  # noqa: BLE001 - pymupdf raises a wide set of errors
        return "", f"PDF open error: {str(exc)[:80]}"

    try:
        pages_to_read = min(PDF_PAGES, len(doc))
        text = "".join(doc[page_num].get_text() for page_num in range(pages_to_read))
    finally:
        doc.close()

    if len(text.strip()) < MIN_PDF_CHARS:
        return "", SCANNED_SKIP_REASON

    return text[:MAX_CONTENT_CHARS], ""


# ─────────────────────────────────────────────────────────────
# Bedrock classification
# ─────────────────────────────────────────────────────────────
def _strip_json_fences(text: str) -> str:
    """Strip leading ```json and trailing ``` fences."""
    return JSON_FENCE_RE.sub("", text).strip()


def classify(client: Any, content: str) -> dict[str, Any]:
    """Classify document content via Bedrock Claude; returns parsed JSON dict."""
    payload = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": MAX_OUTPUT_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }

    response = client.invoke_model(
        modelId=INFERENCE_PROFILE_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(payload),
    )

    response_body = json.loads(response["body"].read())
    raw_text = response_body["content"][0]["text"].strip()
    cleaned = _strip_json_fences(raw_text)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON response: %r", cleaned[:200])
        return {
            "document_type": "Unknown",
            "confidence": "Low",
            "reason": "LLM response parse error.",
        }


# ─────────────────────────────────────────────────────────────
# Result formatting
# ─────────────────────────────────────────────────────────────
def write_excel(records: list[dict[str, Any]], output_path: Path) -> None:
    """Write classification ``records`` to an ``.xlsx`` at ``output_path``."""
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = "Document Classification"
    sheet.append(list(EXCEL_HEADERS))

    for record in records:
        sheet.append([
            record["file_path"],
            record["document_type"],
            record.get("confidence", ""),
            record.get("reason", ""),
        ])

    workbook.save(str(output_path))


# ─────────────────────────────────────────────────────────────
# Per-file processing
# ─────────────────────────────────────────────────────────────
def process_pdf(client: Any, filepath: Path, rel_path: str) -> dict[str, Any] | None:
    """Read, pre-screen, and classify a single PDF.

    Returns ``None`` for scanned PDFs (they are excluded from the output).
    Errors during read/classify are captured into the returned record.
    """
    try:
        content, skip_reason = read_pdf(filepath)
    except Exception as exc:  # noqa: BLE001 - per-file isolation is intentional
        logger.exception("Failed to read %s", rel_path)
        return {
            "file_path": rel_path,
            "document_type": "Error",
            "confidence": "Low",
            "reason": f"Read error: {str(exc)[:100]}",
        }

    if skip_reason == SCANNED_SKIP_REASON:
        logger.info("Skipping scanned PDF: %s", rel_path)
        return None

    if skip_reason:
        return {
            "file_path": rel_path,
            "document_type": "Skipped",
            "confidence": "N/A",
            "reason": skip_reason,
        }

    try:
        result = classify(client, content)
    except (BotoCoreError, ClientError, KeyError, ValueError) as exc:
        logger.exception("Classification failed for %s", rel_path)
        result = {
            "document_type": "Error",
            "confidence": "Low",
            "reason": str(exc)[:120],
        }

    return {
        "file_path": rel_path,
        "document_type": result.get("document_type", "Unknown"),
        "confidence": result.get("confidence", ""),
        "reason": result.get("reason", ""),
    }


# ─────────────────────────────────────────────────────────────
# Test mode (single document smoke test)
# ─────────────────────────────────────────────────────────────
def run_test(script_dir: Path) -> int:
    """Run the full pipeline on the first non-scanned PDF and print the result.

    Useful as a smoke test — verifies AWS credentials, inference profile,
    PDF reading, and JSON parsing without touching the Excel output.
    """
    client = get_bedrock_client()
    pdfs = discover_pdfs(script_dir)

    if not pdfs:
        logger.error("No .pdf files found under %s.", script_dir)
        return 1

    for filepath in pdfs:
        rel_path = str(filepath.relative_to(script_dir))
        logger.info("Test: processing %s", rel_path)
        record = process_pdf(client, filepath, rel_path)
        if record is None:
            logger.info("  -> scanned PDF, trying next file")
            continue
        print(json.dumps(record, indent=2))
        return 0

    logger.error("All %d PDF(s) were scanned; nothing to test.", len(pdfs))
    return 1


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────
def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run on a single PDF and print the result (no Excel output).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run the PDF classification pipeline; returns process exit code."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    args = parse_args(argv)
    script_dir = Path(__file__).parent

    if args.test:
        return run_test(script_dir)

    output_path = script_dir / OUTPUT_EXCEL

    client = get_bedrock_client()
    pdfs = discover_pdfs(script_dir)

    if not pdfs:
        logger.warning("No .pdf files found under %s. Exiting.", script_dir)
        return 1

    logger.info("Found %d PDF file(s) to process.", len(pdfs))

    records: list[dict[str, Any]] = []
    skipped_scanned = 0
    for filepath in tqdm(pdfs, desc="Classifying PDFs"):
        rel_path = str(filepath.relative_to(script_dir))
        record = process_pdf(client, filepath, rel_path)
        if record is None:
            skipped_scanned += 1
            continue
        records.append(record)

    write_excel(records, output_path)
    logger.info(
        "Done. Processed %d, skipped %d scanned PDF(s). Results saved to %s",
        len(records), skipped_scanned, output_path,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
