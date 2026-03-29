"""Premium Calculator tool — generates a dummy premium quote for a submission
by reading extraction data from S3."""

import json
import logging
import random

from strands import tool

import settings
import context as ctx_mod

logger = logging.getLogger("agentcore.tools.premium_calculator")

EMAIL_BUCKET = "underwriting-app-emails"


def _get_extraction_data(submission_id: str) -> dict | None:
    """Read extraction.json from S3."""
    key = f"emails/{submission_id}/extraction.json"
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        return json.loads(resp["Body"].read().decode())
    except Exception as e:
        logger.error(f"Failed to read extraction: {e}")
        return None


@tool
def generate_premium() -> str:
    """Generate a premium quote for the current submission. Reads policy details from \
the extraction data in S3 and calculates a dummy premium based on the extracted fields. \
No parameters needed — uses the current submission context.

    Returns:
        A formatted premium quote with breakdown.
    """
    submission_id = ctx_mod.get_ticket_key()
    if not submission_id:
        return "Error: No submission ID found in session context."

    extraction = _get_extraction_data(submission_id)
    if not extraction:
        return f"No extraction data found for submission {submission_id}. Extraction must complete first."

    # Read fields from extraction
    fields = {}
    for f in extraction.get("extracted_data", []):
        fields[f["field_name"]] = f.get("value", "")

    policy_number = fields.get("Policy Number", "N/A")
    insured_name = fields.get("Insured Name", "N/A")

    # Generate dummy premium figures
    base_premium = round(random.uniform(5000, 50000), 2)
    tax_rate = 0.12
    broker_fee = round(base_premium * 0.05, 2)
    taxes = round(base_premium * tax_rate, 2)
    total = round(base_premium + broker_fee + taxes, 2)

    return f"""**Premium Quote — {insured_name}**

| Item | Amount |
|---|---|
| **Policy Number** | {policy_number} |
| **Insured** | {insured_name} |
| **Base Premium** | ${base_premium:,.2f} |
| **Broker Fee (5%)** | ${broker_fee:,.2f} |
| **Taxes & Levies (12%)** | ${taxes:,.2f} |
| **Total Premium** | **${total:,.2f}** |

**Coverage Period:** 12 months
**Payment Terms:** Quarterly installments

⚠️ _This is an indicative quote. Final premium subject to underwriter review._"""
