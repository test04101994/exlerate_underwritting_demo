"""Strands tool: extract structured data from uploaded PDFs for human validation."""

import logging

import boto3
import context as ctx_mod
import state as state_mod
from data_extraction import run_extraction
from strands import tool

logger = logging.getLogger("agentcore")

import settings

S3_BUCKET = settings.S3_BUCKET
_s3 = settings.s3_client


def _list_s3_docs(ticket_key: str) -> list[str]:
    """Dynamically list all uploaded PDFs for a ticket from S3."""
    prefix = "uploads/"
    try:
        resp = _s3.list_objects_v2(Bucket=S3_BUCKET, Prefix=prefix)
        keys = []
        for obj in resp.get("Contents", []):
            key = obj.get("Key", "")
            if not key.lower().endswith(".pdf"):
                continue
            # If ticket_key is set, filter by it
            if ticket_key:
                if f"/{ticket_key}/" in key:
                    keys.append(key)
            else:
                # No ticket filter — return all PDFs
                keys.append(key)
        logger.info(f"[_list_s3_docs] ticket={ticket_key or 'ALL'}, found {len(keys)} PDFs")
        # Sort by key descending (approximation of most recent first)
        return sorted(keys, reverse=True)
    except Exception as e:
        logger.error(f"[extract_data] S3 list failed: {e}")
        return []


@tool
def extract_data(s3_key: str = "") -> str:
    """Extract structured data fields from an uploaded PDF document.

    Parses the PDF, uses AI to identify key fields (names, dates, amounts, policy numbers, etc.),
    locates their bounding boxes in the document, and stores results for human validation.

    Call this when the user asks to extract, parse, or pull data from an uploaded document.
    If s3_key is not provided, the most recently uploaded document for the current ticket is used.

    Args:
        s3_key: S3 key of the uploaded PDF. If empty, uses the latest uploaded document.

    Returns:
        Confirmation with extraction ID and a link to the validation page.
    """
    ticket_key = ctx_mod.get_ticket_key()
    logger.info(f"[extract_data] ticket_key={ticket_key!r}, s3_key={s3_key!r}")

    # If no s3_key provided, dynamically find the latest PDF from S3 for this ticket
    if not s3_key:
        docs = _list_s3_docs(ticket_key)
        if docs:
            s3_key = docs[0]  # most recent upload
            logger.info(f"[extract_data] Auto-selected latest doc: {s3_key}")
        else:
            return "No document has been uploaded yet. Please upload a PDF first."

    logger.info(f"[extract_data] Starting extraction: s3_key={s3_key}, ticket={ticket_key}")

    try:
        result = run_extraction(
            s3_key=s3_key,
            ticket_key=ticket_key,
        )

        extraction_id = result.get("extraction_id", "")
        field_count = len(result.get("extracted_data", []))

        # Store in pending queue for main.py to pick up and send WS message
        state_mod._pending_extractions_queue["__latest__"] = result

        logger.info(f"[extract_data] Extraction {extraction_id}: {field_count} fields extracted")

        return (
            f"Data extraction complete. {field_count} fields extracted from the document. "
            f"The results are ready for validation — open the Data Validation page to review, "
            f"approve, or correct the extracted fields."
        )

    except Exception as e:
        logger.error(f"[extract_data] Extraction failed: {e}")
        return f"Data extraction failed: {str(e)}"
