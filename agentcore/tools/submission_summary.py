"""Submission Summary tool — creates a summary of the submission from S3 metadata + extraction."""

import json
import logging

from strands import tool

import settings
import context as ctx_mod

logger = logging.getLogger("agentcore.tools.submission_summary")

EMAIL_BUCKET = "underwriting-app-emails"


@tool
def submission_summary() -> str:
    """Generate a comprehensive summary of the current submission by reading metadata and \
extraction data from S3. Includes email details, attachments, and extracted fields. \
No parameters needed — uses the current submission context.

    Returns:
        A formatted submission summary.
    """
    submission_id = ctx_mod.get_ticket_key()
    if not submission_id:
        return "Error: No submission ID found in session context."

    prefix = f"emails/{submission_id}/"

    # Read metadata.json
    metadata = None
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=f"{prefix}metadata.json")
        metadata = json.loads(resp["Body"].read().decode())
    except Exception as e:
        logger.error(f"Failed to read metadata: {e}")

    # Read extraction.json
    extraction = None
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=f"{prefix}extraction.json")
        extraction = json.loads(resp["Body"].read().decode())
    except Exception as e:
        logger.warning(f"No extraction data: {e}")

    if not metadata and not extraction:
        return f"No data found for submission {submission_id}."

    lines = [f"## Submission Summary\n**ID:** `{submission_id}`\n"]

    # Email details from metadata
    if metadata:
        lines.append("### Email Details")
        lines.append(f"- **From:** {metadata.get('from_address', 'N/A')}")
        lines.append(f"- **To:** {', '.join(metadata.get('to_addresses', []))}")
        lines.append(f"- **Subject:** {metadata.get('subject', 'N/A')}")
        lines.append(f"- **Received:** {metadata.get('received_at', 'N/A')}")
        lines.append(f"- **Processed:** {metadata.get('processed_at', 'N/A')}")

        # Attachments
        files = metadata.get("files", [])
        attachments = [f for f in files if f.get("type") == "attachment"]
        if attachments:
            lines.append(f"\n### Attachments ({len(attachments)})")
            for att in attachments:
                size_kb = att.get("size_bytes", 0) / 1024
                lines.append(f"- **{att.get('filename', 'unknown')}** ({size_kb:.1f} KB)")
        else:
            lines.append("\n### Attachments\nNone")

    # Extracted fields
    if extraction:
        extracted = extraction.get("extracted_data", [])
        doc_name = extraction.get("document_name", "")
        lines.append(f"\n### Extracted Data")
        if doc_name:
            lines.append(f"**Source:** {doc_name}")
        lines.append(f"**Status:** {extraction.get('status', 'N/A')}\n")
        for field in extracted:
            name = field.get("field_name", "")
            value = field.get("value", "—") or "—"
            conf = field.get("confidence", 0)
            conf_str = f"{conf:.0%}" if conf else "—"
            lines.append(f"- **{name}:** {value} _{conf_str}_")
    else:
        lines.append("\n### Extracted Data\n_No extraction data available._")

    return "\n".join(lines)
