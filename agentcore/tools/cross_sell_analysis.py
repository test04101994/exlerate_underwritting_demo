"""Cross-sell analysis tool — identifies coverage gaps and upsell opportunities
using extraction data and the claims knowledge base."""

import json
import logging

from strands import tool

import context as ctx_mod
import settings
from tools.doc_analysis import get_embedding

logger = logging.getLogger("agentcore.tools.cross_sell_analysis")

EMAIL_BUCKET = "underwriting-app-emails"
CLAIMS_INDEX = "property-claims-kb"

# State → region mapping
STATE_TO_REGION = {
    "TX": "South", "FL": "South", "GA": "South", "LA": "South", "NC": "South",
    "SC": "South", "AL": "South", "MS": "South", "TN": "South", "VA": "South",
    "NY": "Northeast", "NJ": "Northeast", "MA": "Northeast", "CT": "Northeast",
    "PA": "Northeast", "MD": "Northeast", "RI": "Northeast", "ME": "Northeast",
    "IL": "Midwest", "OH": "Midwest", "MI": "Midwest", "IN": "Midwest",
    "WI": "Midwest", "MN": "Midwest", "IA": "Midwest", "MO": "Midwest",
    "CA": "West", "WA": "West", "OR": "West", "CO": "West", "AZ": "West",
    "NV": "West", "UT": "West",
}

FLOOD_PRONE_STATES = {"TX", "FL", "LA", "NC", "SC", "MS", "AL"}
EARTHQUAKE_STATES = {"CA", "WA", "OR", "AK"}


def _get_extraction_fields(submission_id: str) -> dict:
    key = f"emails/{submission_id}/extraction.json"
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        data = json.loads(resp["Body"].read().decode())
        fields = {}
        for f in data.get("extracted_data", []):
            fields[f["field_name"]] = f.get("value", "")
        return fields
    except Exception as e:
        logger.error(f"Failed to read extraction: {e}")
        return {}


def _parse_state_from_address(address: str) -> str:
    """Extract 2-letter state code from address."""
    parts = [p.strip() for p in address.replace(",", " ").split()]
    for p in parts:
        if len(p) == 2 and p.upper() in STATE_TO_REGION:
            return p.upper()
    return ""


def _parse_tiv(tiv_str: str) -> float:
    try:
        return float(tiv_str.replace(",", "").replace("$", ""))
    except (ValueError, AttributeError):
        return 0


def _query_claims_kb(query_text: str, top_k: int = 10) -> list[dict]:
    try:
        embedding = get_embedding(query_text)
        resp = settings.s3vectors_client.query_vectors(
            vectorBucketName=settings.VECTOR_BUCKET_NAME,
            indexName=CLAIMS_INDEX,
            queryVector={"float32": embedding},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
        )
        return resp.get("vectors", [])
    except Exception as e:
        logger.warning(f"Claims KB query failed: {e}")
        return []


@tool
def cross_sell_analysis() -> str:
    """Analyze the current submission for coverage gaps and cross-sell opportunities. \
Reads extraction data from S3 and queries the claims knowledge base to identify \
missing coverages. Returns prioritized opportunities with estimated premium uplift. \
No parameters needed.

    Returns:
        Formatted cross-sell analysis with coverage gaps and recommendations.
    """
    submission_id = ctx_mod.get_ticket_key()
    if not submission_id:
        return "Error: No submission ID found in session context."

    fields = _get_extraction_fields(submission_id)
    if not fields:
        return f"No extraction data found for submission {submission_id}."

    insured_name = fields.get("Insured Name", "Unknown")
    property_type = fields.get("Property Type", "")
    coverage_type = fields.get("Coverage Type", "")
    tiv = _parse_tiv(fields.get("Total Insured Value", "0"))
    loss_history = fields.get("Loss History", "")
    occupancy = fields.get("Occupancy Type", "")
    address = fields.get("Insured Address", "")
    year_built = int(fields.get("Year Built", "2000") or "2000")
    construction = fields.get("Construction Type", "")

    state = _parse_state_from_address(address)
    region = STATE_TO_REGION.get(state, "Unknown")

    # Query claims KB for similar risks
    query = f"{property_type} {occupancy} property claims in {region} region"
    claims_results = _query_claims_kb(query)

    # Analyze loss types from similar claims
    loss_type_counts = {}
    total_loss = 0
    for r in claims_results:
        meta = r.get("metadata", {})
        lt = meta.get("loss_type", "")
        amt = float(meta.get("loss_amount", "0"))
        if lt:
            loss_type_counts[lt] = loss_type_counts.get(lt, 0) + 1
            total_loss += amt

    # ── Gap Detection Rules ──────────────────────────────────────────────
    opportunities = []

    # 1. Flood gap
    if state in FLOOD_PRONE_STATES and coverage_type.lower() in ("named perils", ""):
        uplift = round(tiv * 0.0005) if tiv else 2250
        opportunities.append(("HIGH", "Flood Endorsement", uplift,
            f"Property in {state} (flood-prone region); coverage is '{coverage_type or 'not specified'}'"))

    # 2. Business Interruption
    if tiv > 2000000:
        uplift = round(tiv * 0.001) if tiv else 4500
        opportunities.append(("HIGH", "Business Interruption", uplift,
            f"TIV (${tiv:,.0f}) exceeds $2M threshold; BI coverage critical for continuity"))

    # 3. Equipment Breakdown
    if occupancy.lower() in ("office", "warehouse", "manufacturing"):
        uplift = round(tiv * 0.0002) if tiv else 900
        opportunities.append(("MED", "Equipment Breakdown", uplift,
            f"{occupancy} occupancy relies on mechanical/electrical systems"))

    # 4. Cyber Liability
    if occupancy.lower() in ("office",):
        uplift = round(tiv * 0.0003) if tiv else 1350
        opportunities.append(("MED", "Cyber Liability", uplift,
            f"Office occupancy with IT infrastructure exposure"))

    # 5. Umbrella
    if tiv > 5000000:
        uplift = round(tiv * 0.0004) if tiv else 5000
        opportunities.append(("MED", "Commercial Umbrella", uplift,
            f"TIV (${tiv:,.0f}) exceeds $5M — umbrella provides excess protection"))

    # 6. Ordinance & Law
    if year_built < 2000:
        uplift = round(tiv * 0.00015) if tiv else 675
        opportunities.append(("LOW", "Ordinance & Law", uplift,
            f"Building constructed in {year_built} — may require code upgrades after loss"))

    # 7. Earthquake (West Coast)
    if state in EARTHQUAKE_STATES:
        uplift = round(tiv * 0.001) if tiv else 4500
        opportunities.append(("HIGH", "Earthquake Coverage", uplift,
            f"Property in {state} — seismic zone exposure"))

    # 8. Claims-driven: check if similar risks have loss types not covered
    if "fire" in loss_type_counts and loss_type_counts["fire"] >= 2 and construction.lower() == "frame":
        opportunities.append(("HIGH", "Fire Suppression Upgrade Discount", round(tiv * 0.0003),
            f"Frame construction with {loss_type_counts['fire']} fire claims in peer group"))

    # ── Format Output ────────────────────────────────────────────────────
    total_uplift = sum(o[2] for o in opportunities)
    high_count = sum(1 for o in opportunities if o[0] == "HIGH")

    lines = [f"## Cross-Sell Analysis — {insured_name}\n"]
    lines.append(f"**Profile:** {property_type} | {occupancy} | {construction} | TIV: ${tiv:,.0f} | {state or 'N/A'}\n")

    if opportunities:
        lines.append("### Coverage Gaps Identified\n")
        for i, (prio, name, uplift, rationale) in enumerate(opportunities, 1):
            prio_icon = "🔴" if prio == "HIGH" else "🟡" if prio == "MED" else "🟢"
            lines.append(f"{prio_icon} **{i}. {name}** — {prio}")
            lines.append(f"   Est. uplift: **${uplift:,.0f}**")
            lines.append(f"   _{rationale}_\n")
    else:
        lines.append("### No Coverage Gaps Detected\nCurrent coverage appears comprehensive.")

    # Claims intelligence section
    if claims_results:
        lines.append(f"---\n### Claims Intelligence ({len(claims_results)} similar claims analyzed)\n")
        if loss_type_counts:
            sorted_types = sorted(loss_type_counts.items(), key=lambda x: -x[1])
            for lt, count in sorted_types:
                lines.append(f"- **{lt.title()}:** {count} claims")
        if total_loss > 0:
            avg_loss = total_loss / len(claims_results)
            lines.append(f"- **Average loss severity:** ${avg_loss:,.0f}")

    lines.append(f"\n---\n### Summary\n")
    lines.append(f"- **{high_count} HIGH priority** opportunities identified")
    lines.append(f"- **Total estimated premium uplift: ${total_uplift:,.0f}**")

    return "\n".join(lines)
