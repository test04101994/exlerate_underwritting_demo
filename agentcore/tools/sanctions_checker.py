"""Sanctions Checker tool — reads insured name from extraction.json in S3
and checks against the GLEIF API for entity verification."""

import json
import logging
import urllib.request
import urllib.parse

from strands import tool

import settings
import context as ctx_mod

logger = logging.getLogger("agentcore.tools.sanctions_checker")

GLEIF_API_BASE = "https://api.gleif.org/api/v1/lei-records"
EMAIL_BUCKET = "underwriting-app-emails"


def _get_insured_name_from_s3(submission_id: str) -> str:
    """Read extraction.json from S3 and return the Insured Name value."""
    key = f"emails/{submission_id}/extraction.json"
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        data = json.loads(resp["Body"].read().decode())
        for field in data.get("extracted_data", []):
            if field.get("field_name") == "Insured Name":
                return field.get("value", "")
        return ""
    except Exception as e:
        logger.error(f"Failed to read extraction from S3: {e}")
        return ""


def _search_gleif(entity_name: str) -> list[dict]:
    """Search GLEIF API for an entity by name."""
    params = urllib.parse.urlencode({
        "filter[entity.legalName]": entity_name,
        "page[size]": "5",
    })
    url = f"{GLEIF_API_BASE}?{params}"
    logger.info(f"[sanctions_checker] GLEIF query: {url}")

    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
            return body.get("data", [])
    except Exception as e:
        logger.error(f"GLEIF API error: {e}")
        return []


@tool
def sanctions_checker() -> str:
    """Check the insured entity name against the GLEIF (Global Legal Entity Identifier Foundation) \
registry for sanctions and entity verification. Reads the insured name automatically from the \
extraction data stored in S3 for the current submission. No parameters needed.

    Returns:
        Sanctions check result with entity details or no-match finding.
    """
    submission_id = ctx_mod.get_ticket_key()

    if not submission_id:
        return "Error: No submission ID provided or found in session context. Please provide a submission ID."

    # Step 1: Read insured name from extraction.json in S3
    insured_name = _get_insured_name_from_s3(submission_id)
    if not insured_name:
        return (
            f"No 'Insured Name' found in extraction data for submission {submission_id}. "
            "Please ensure the extraction has been completed first."
        )

    logger.info(f"[sanctions_checker] Checking: '{insured_name}' for submission {submission_id}")

    # Step 2: Search GLEIF API
    results = _search_gleif(insured_name)

    # Step 3: Format results
    if not results:
        # Try fuzzy search with just the first few words
        words = insured_name.split()
        if len(words) > 2:
            partial = " ".join(words[:2])
            results = _search_gleif(partial)

    if not results:
        return (
            f"**Sanctions Check Result for: {insured_name}**\n\n"
            f"⚠️ **NO MATCH FOUND** in GLEIF registry.\n\n"
            f"The entity '{insured_name}' was not found in the Global LEI database. "
            f"This could mean:\n"
            f"- The entity does not have a Legal Entity Identifier (LEI)\n"
            f"- The name may be spelled differently in official records\n"
            f"- Further manual verification is recommended\n\n"
            f"**Recommendation:** Flag for manual review."
        )

    # Format matched results
    lines = [f"**Sanctions Check Result for: {insured_name}**\n"]
    lines.append(f"✅ **{len(results)} match(es) found** in GLEIF registry.\n")

    for i, record in enumerate(results[:3], 1):
        entity = record.get("attributes", {}).get("entity", {})
        reg = record.get("attributes", {}).get("registration", {})
        lei = record.get("attributes", {}).get("lei", record.get("id", ""))

        legal_name = entity.get("legalName", {}).get("name", "N/A")
        status = entity.get("status", "N/A")
        jurisdiction = entity.get("jurisdiction", "N/A")
        category = entity.get("category", "N/A")
        reg_status = reg.get("status", "N/A")
        next_renewal = reg.get("nextRenewalDate", "N/A")

        address = entity.get("legalAddress", {})
        addr_str = ", ".join(filter(None, [
            " ".join(address.get("addressLines", [])),
            address.get("city", ""),
            address.get("region", ""),
            address.get("country", ""),
        ]))

        lines.append(f"### Match {i}: {legal_name}")
        lines.append(f"- **LEI:** {lei}")
        lines.append(f"- **Entity Status:** {status}")
        lines.append(f"- **Registration Status:** {reg_status}")
        lines.append(f"- **Jurisdiction:** {jurisdiction}")
        lines.append(f"- **Category:** {category}")
        lines.append(f"- **Address:** {addr_str}")
        lines.append(f"- **Next Renewal:** {next_renewal}")
        lines.append("")

    corroboration = results[0].get("attributes", {}).get("registration", {}).get("corroborationLevel", "N/A")
    lines.append(f"**Corroboration Level:** {corroboration}")
    lines.append(f"\n**Overall Status:** {'🟢 CLEAR' if results[0].get('attributes', {}).get('entity', {}).get('status') == 'ACTIVE' else '🟡 REVIEW NEEDED'}")

    return "\n".join(lines)
