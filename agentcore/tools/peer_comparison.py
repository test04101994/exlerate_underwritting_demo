"""Peer comparison tool — benchmarks submission against similar risks
in the book of business using the policy knowledge base."""

import json
import logging

from strands import tool

import context as ctx_mod
import settings
from tools.doc_analysis import get_embedding

logger = logging.getLogger("agentcore.tools.peer_comparison")

EMAIL_BUCKET = "underwriting-app-emails"
POLICY_INDEX = "property-policy-kb"

STATE_TO_REGION = {
    "TX": "South", "FL": "South", "GA": "South", "LA": "South", "NC": "South",
    "SC": "South", "AL": "South", "MS": "South", "TN": "South", "VA": "South",
    "NY": "Northeast", "NJ": "Northeast", "MA": "Northeast", "CT": "Northeast",
    "PA": "Northeast", "MD": "Northeast",
    "IL": "Midwest", "OH": "Midwest", "MI": "Midwest", "IN": "Midwest",
    "WI": "Midwest", "MN": "Midwest",
    "CA": "West", "WA": "West", "OR": "West", "CO": "West", "AZ": "West",
}


def _get_extraction_fields(submission_id: str) -> dict:
    key = f"emails/{submission_id}/extraction.json"
    try:
        resp = settings.s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        data = json.loads(resp["Body"].read().decode())
        return {f["field_name"]: f.get("value", "") for f in data.get("extracted_data", [])}
    except Exception as e:
        logger.error(f"Failed to read extraction: {e}")
        return {}


def _parse_state(address: str) -> str:
    parts = [p.strip() for p in address.replace(",", " ").split()]
    for p in parts:
        if len(p) == 2 and p.upper() in STATE_TO_REGION:
            return p.upper()
    return ""


def _safe_float(val, default=0.0):
    try:
        return float(str(val).replace(",", "").replace("$", "").replace("%", ""))
    except (ValueError, TypeError):
        return default


def _query_policy_kb(query_text: str, top_k: int = 10) -> list[dict]:
    try:
        embedding = get_embedding(query_text)
        resp = settings.s3vectors_client.query_vectors(
            vectorBucketName=settings.VECTOR_BUCKET_NAME,
            indexName=POLICY_INDEX,
            queryVector={"float32": embedding},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
        )
        return resp.get("vectors", [])
    except Exception as e:
        logger.warning(f"Policy KB query failed: {e}")
        return []


@tool
def peer_comparison() -> str:
    """Benchmark the current submission against similar risks in the book of business. \
Queries the policy knowledge base for comparable properties and compares on premium, \
loss ratio, deductible, and coverage. No parameters needed.

    Returns:
        Formatted peer comparison with benchmarks and key findings.
    """
    submission_id = ctx_mod.get_ticket_key()
    if not submission_id:
        return "Error: No submission ID found in session context."

    fields = _get_extraction_fields(submission_id)
    if not fields:
        return f"No extraction data found for submission {submission_id}."

    insured_name = fields.get("Insured Name", "Unknown")
    property_type = fields.get("Property Type", "Commercial")
    construction = fields.get("Construction Type", "")
    occupancy = fields.get("Occupancy Type", "")
    tiv = _safe_float(fields.get("Total Insured Value", "0"))
    address = fields.get("Insured Address", "")
    year_built = fields.get("Year Built", "")
    coverage_type = fields.get("Coverage Type", "")

    state = _parse_state(address)
    region = STATE_TO_REGION.get(state, "Unknown")

    # Build semantic query
    query = (
        f"{property_type} {occupancy} property, {construction} construction, "
        f"TIV ${tiv:,.0f}, {region} region"
    )
    results = _query_policy_kb(query, top_k=10)

    if not results:
        return "No peer policies found in the knowledge base. Run the seeding script first."

    # Post-filter by property type, keep up to 5
    peers = []
    for r in results:
        meta = r.get("metadata", {})
        if meta.get("property_type", "").lower() == property_type.lower():
            peers.append(meta)
        if len(peers) >= 5:
            break

    # If too few exact matches, include all results
    if len(peers) < 3:
        peers = [r.get("metadata", {}) for r in results[:5]]

    # Compute peer metrics
    peer_premiums = [_safe_float(p.get("premium")) for p in peers if _safe_float(p.get("premium")) > 0]
    peer_tivs = [_safe_float(p.get("tiv")) for p in peers if _safe_float(p.get("tiv")) > 0]
    peer_loss_ratios = [_safe_float(p.get("loss_ratio")) for p in peers if _safe_float(p.get("loss_ratio")) > 0]
    peer_deductibles = [_safe_float(p.get("deductible")) for p in peers if _safe_float(p.get("deductible")) > 0]
    peer_limits = [_safe_float(p.get("coverage_limit")) for p in peers if _safe_float(p.get("coverage_limit")) > 0]

    # Premium per $1K TIV
    peer_rate_per_1k = []
    for p in peers:
        p_tiv = _safe_float(p.get("tiv"))
        p_prem = _safe_float(p.get("premium"))
        if p_tiv > 0 and p_prem > 0:
            peer_rate_per_1k.append(p_prem / (p_tiv / 1000))

    avg_rate = sum(peer_rate_per_1k) / len(peer_rate_per_1k) if peer_rate_per_1k else 0
    min_rate = min(peer_rate_per_1k) if peer_rate_per_1k else 0
    max_rate = max(peer_rate_per_1k) if peer_rate_per_1k else 0
    avg_loss_ratio = sum(peer_loss_ratios) / len(peer_loss_ratios) if peer_loss_ratios else 0
    avg_deductible = sum(peer_deductibles) / len(peer_deductibles) if peer_deductibles else 0
    avg_limit = sum(peer_limits) / len(peer_limits) if peer_limits else 0

    # Submission's estimated rate (using peer avg if no premium in extraction)
    sub_rate = avg_rate  # Will show as "Pending" since no premium in extraction yet

    # ── Format Output ────────────────────────────────────────────────────
    lines = [f"## Peer Comparison — {insured_name}\n"]
    lines.append(
        f"**Submission Profile:** {property_type} | {construction} | {occupancy} | "
        f"TIV: ${tiv:,.0f} | {state or 'N/A'} ({region})\n"
    )

    # Benchmarks
    lines.append(f"### Benchmarks ({len(peers)} peers)\n")

    if avg_rate > 0:
        lines.append(f"**Premium / $1K TIV**")
        lines.append(f"- This submission: _Pending quote_")
        lines.append(f"- Peer average: **${avg_rate:.2f}**")
        lines.append(f"- Range: ${min_rate:.2f} — ${max_rate:.2f}\n")

    if avg_loss_ratio > 0:
        lines.append(f"**Loss Ratio**")
        lines.append(f"- This submission: _N/A (new risk)_")
        lines.append(f"- Peer average: **{avg_loss_ratio:.0%}**")
        lines.append(f"- Range: {min(peer_loss_ratios):.0%} — {max(peer_loss_ratios):.0%}\n")

    if avg_deductible > 0:
        lines.append(f"**Deductible**")
        lines.append(f"- Peer average: **${avg_deductible:,.0f}**")
        lines.append(f"- Range: ${min(peer_deductibles):,.0f} — ${max(peer_deductibles):,.0f}\n")

    if avg_limit > 0:
        lines.append(f"**Coverage Limit**")
        lines.append(f"- Peer average: **${avg_limit:,.0f}**")
        lines.append(f"- Range: ${min(peer_limits):,.0f} — ${max(peer_limits):,.0f}\n")

    # Peer details
    lines.append(f"---\n### Peer Details\n")
    for i, p in enumerate(peers, 1):
        p_tiv = _safe_float(p.get("tiv"))
        p_prem = _safe_float(p.get("premium"))
        p_lr = _safe_float(p.get("loss_ratio"))
        p_claims = p.get("claims_count", "0")
        lines.append(f"**{i}. {p.get('insured_name', 'N/A')}** ({p.get('policy_number', '')})")
        lines.append(f"   {p.get('property_type', '')}/{p.get('occupancy_type', '')} | TIV: ${p_tiv:,.0f} | Premium: ${p_prem:,.0f} | Loss ratio: {p_lr:.0%} | Claims: {p_claims}\n")

    # Key findings
    lines.append("---\n### Key Findings\n")
    if avg_rate > 0:
        suggested = round(avg_rate * (tiv / 1000))
        lines.append(f"- **Suggested premium range:** ${round(min_rate * (tiv/1000)):,} — ${round(max_rate * (tiv/1000)):,} (avg: **${suggested:,}**)")

    claims_peers = [p for p in peers if int(p.get("claims_count", "0")) > 0]
    lines.append(f"- **{len(claims_peers)} of {len(peers)}** peers have claims history")
    lines.append(f"- **Average peer loss ratio:** {avg_loss_ratio:.0%}")

    if avg_deductible > 0 and tiv > 0:
        ded_pct = avg_deductible / tiv * 100
        lines.append(f"- **Typical deductible:** {ded_pct:.2f}% of TIV")

    return "\n".join(lines)
