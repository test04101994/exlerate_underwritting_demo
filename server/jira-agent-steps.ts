/**
 * Realistic agentic step messages for each Jira/underwriting workflow agent.
 * Data matches the values shown in the Jira data extraction form
 * (public/jira-forms/data-extraction-config.json) and source document.
 *
 * Key policy data:
 *   Original Insured : ABC Private Limited
 *   Reinsured        : John Doe
 *   UMR              : B1222PK1621445
 *   Risk Type        : All Risks of Direct Physical Loss or Damage Reinsurance
 *   Period           : 30/11/2024 – 29/11/2025
 *   Limit (100%)     : USD 10,000,000
 *   Deductible       : USD 10,000 per occurrence
 *   Annual Premium   : USD 1,045,000 (100%)
 *   Location         : Ecuador
 */

import type { AgentStep } from './insurance-agent-steps';
export type { AgentStep };

/**
 * Returns agent steps with real ticket data injected.
 * @param ticketKey  e.g. "XSX-4333"
 * @param ticketSummary  e.g. "ABC Private Limited — All Risks Reinsurance"
 */
export function getJiraAgentSteps(
  ticketKey: string,
  ticketSummary: string,
  attachmentFilename?: string
): Record<string, AgentStep[]> {
  const slipFilename = attachmentFilename || `document (10).pdf`;

  return {

  // ─── Data Extraction Agent ────────────────────────────────────────────────
  extractor: [
    {
      progress: 8,
      delayMs: 3500,
      message: `**Thinking:** Opening Jira ticket ${ticketKey}. Will fetch ticket metadata and attachment list, then run OCR on the reinsurance slip PDF to extract structured fields. Need to map raw extracted values against the London Market slip schema before populating the submission form.`
    },
    {
      progress: 18,
      delayMs: 4000,
      message: `→ \`fetch_jira_ticket\`
\`\`\`json
{ "ticket_id": "${ticketKey}", "include_attachments": true, "include_comments": false }
\`\`\`
Fetching Jira ticket metadata and attachment list...`
    },
    {
      progress: 30,
      delayMs: 3200,
      message: `✓ \`fetch_jira_ticket\` returned:
\`\`\`json
{
  "ticket_id": "${ticketKey}",
  "summary": "${ticketSummary}",
  "status": "In Review",
  "attachments": [
    { "id": "att-001", "filename": "${slipFilename}", "size_kb": 909 }
  ],
  "reporter": "underwriter@exlservice.com"
}
\`\`\`
**Thinking:** Found 1 attachment. \`${slipFilename}\` is the reinsurance slip document — will run OCR extraction to pull structured fields and map them to the submission form schema.`
    },
    {
      progress: 44,
      delayMs: 6500,
      message: `→ \`run_ocr_extraction\`
\`\`\`json
{
  "attachment_id": "att-001",
  "filename": "${slipFilename}",
  "extraction_schema": "london_market_slip_v3",
  "confidence_threshold": 0.75,
  "pages": "all"
}
\`\`\`
Running OCR pipeline on 29-page slip document — this may take a moment...`
    },
    {
      progress: 60,
      delayMs: 5500,
      message: `✓ \`run_ocr_extraction\` returned:
\`\`\`json
{
  "umr": "B1222PK1621445",
  "original_insured": "ABC Private Limited",
  "reinsured": "John Doe",
  "risk_type": "All Risks of Direct Physical Loss or Damage Reinsurance",
  "inception_date": "2024-11-30",
  "expiry_date": "2025-11-29",
  "limit_100pct": 10000000,
  "limit_currency": "USD",
  "deductible": 10000,
  "deductible_currency": "USD",
  "deductible_basis": "per occurrence",
  "annual_premium_100pct": 1045000,
  "situation": "Ecuador",
  "pages_processed": 29,
  "extraction_confidence": 0.94
}
\`\`\`
**Thinking:** OCR complete. Key fields extracted with 94% confidence. Limit, premium, and deductible figures look plausible for the risk size. Will now validate extracted values against the schema rules before committing.`
    },
    {
      progress: 80,
      delayMs: 3800,
      message: `→ \`validate_extracted_fields\`
\`\`\`json
{
  "fields": ["original_insured", "inception_date", "limit_100pct", "deductible"],
  "schema": "london_market_slip_v3",
  "source_document": "att-001"
}
\`\`\`
Validating extracted values against schema rules...`
    },
    {
      progress: 94,
      delayMs: 3000,
      message: `✓ \`validate_extracted_fields\` returned:
\`\`\`json
{
  "date_match": true,
  "limit_match": true,
  "deductible_match": true,
  "discrepancies": [],
  "validation_score": 0.97
}
\`\`\`
**Thinking:** All critical fields validated against schedule. No discrepancies. Extraction confidence 94% — above threshold. Ready to populate submission form.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Data Extraction — Complete**

**Extracted Fields:**
- Original Insured: ABC Private Limited
- Reinsured: John Doe
- Risk Type: All Risks (Direct Physical Loss or Damage Reinsurance)
- Limit (100%): USD 10,000,000
- Deductible: USD 10,000 per occurrence
- Period: 30/11/2024 – 29/11/2025
- Location: Ecuador
- UMR: B1222PK1621445

**Extraction confidence: 94%** · 0 discrepancies · Ready for sanctions screening`
    }
  ],

  // ─── Sanctions Check Agent ───────────────────────────────────────────────
  sanctions: [
    {
      progress: 12,
      delayMs: 1800,
      message: `**Thinking:** Running multi-database sanctions screening for insured *ABC Private Limited* and reinsured *John Doe*, risk location Ecuador. Checking OFAC SDN, UN Security Council, EU Consolidated, and HM Treasury lists.`
    },
    {
      progress: 25,
      delayMs: 2400,
      message: `→ \`screen_entity\`
\`\`\`json
{
  "entity_name": "ABC Private Limited",
  "entity_type": "organisation",
  "country": "ECU",
  "databases": ["OFAC_SDN", "UN_SECURITY_COUNCIL", "EU_CONSOLIDATED", "HM_TREASURY"],
  "fuzzy_match_threshold": 0.85
}
\`\`\`
Querying OFAC SDN list for original insured...`
    },
    {
      progress: 40,
      delayMs: 2200,
      message: `✓ \`screen_entity\` (OFAC + UN) returned:
\`\`\`json
{
  "ofac_result": "CLEAR",
  "un_result": "CLEAR",
  "match_count": 0,
  "closest_match": null,
  "scan_timestamp": "2026-03-14T10:42:18Z"
}
\`\`\``
    },
    {
      progress: 55,
      delayMs: 2200,
      message: `→ \`screen_entity\`
\`\`\`json
{
  "entity_name": "John Doe",
  "entity_type": "individual",
  "country": "ECU",
  "databases": ["EU_CONSOLIDATED", "HM_TREASURY", "OFAC_SDN"],
  "fuzzy_match_threshold": 0.85
}
\`\`\`
Checking reinsured party against EU Consolidated + HM Treasury lists...`
    },
    {
      progress: 70,
      delayMs: 2000,
      message: `✓ \`screen_entity\` (Reinsured) returned:
\`\`\`json
{
  "eu_result": "CLEAR",
  "hm_treasury_result": "CLEAR",
  "ofac_result": "CLEAR",
  "match_count": 0,
  "notes": "Common name — 0 adverse matches after fuzzy deduplication"
}
\`\`\``
    },
    {
      progress: 85,
      delayMs: 1800,
      message: `→ \`screen_location\`
\`\`\`json
{
  "country": "ECU",
  "country_name": "Ecuador",
  "check_type": "country_embargo",
  "embargoed_territories": ["RU", "BY", "IR", "KP", "SY", "CU"]
}
\`\`\`
✓ Location: Ecuador — not subject to trade embargo. No OFAC geographic designation.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Sanctions Screening — Complete**

**Results:**
- Insured (ABC Private Limited): **CLEAR** — OFAC, UN, EU, HM Treasury
- Reinsured (John Doe): **CLEAR** — OFAC, EU, HM Treasury
- Location (Ecuador): **CLEAR** — no embargo

**Overall screening result: PASS**
No adverse findings. Workflow proceeding to premium calculation.`
    }
  ],

  // ─── Premium Calculation Agent ────────────────────────────────────────────
  calculator: [
    {
      progress: 14,
      delayMs: 2000,
      message: `**Thinking:** Sanctions cleared. Computing reinsurance premium for ABC Private Limited. Limit USD 10,000,000, deductible USD 10,000. Annual gross premium per slip: USD 1,045,000 (100%). Applying brokerage and deductible credits.`
    },
    {
      progress: 28,
      delayMs: 2400,
      message: `→ \`lookup_rating_factors\`
\`\`\`json
{
  "risk_type": "property_all_risks_reinsurance",
  "coverage_form": "all_risks",
  "location_country": "ECU",
  "construction_class": "mixed",
  "limit": 10000000
}
\`\`\`
Fetching rating bureau factors for Ecuador property risk...`
    },
    {
      progress: 44,
      delayMs: 2200,
      message: `✓ \`lookup_rating_factors\` returned:
\`\`\`json
{
  "base_rate_on_line": 3.67,
  "nat_cat_loading": 0.42,
  "deductible_credit": -0.18,
  "territorial_factor": 1.12,
  "net_rate_on_line": 3.67
}
\`\`\``
    },
    {
      progress: 58,
      delayMs: 2000,
      message: `→ \`calculate_premium\`
\`\`\`json
{
  "gross_premium_100pct": 1045000,
  "currency": "USD",
  "deductible": 10000,
  "deductible_credit_pct": 0.85,
  "brokerage_pct": 12.5,
  "taxes_pct": 0
}
\`\`\`
Running premium calculation engine...`
    },
    {
      progress: 74,
      delayMs: 2000,
      message: `✓ \`calculate_premium\` returned:
\`\`\`json
{
  "gross_premium": 1045000.00,
  "deductible_credit": -8500.00,
  "premium_after_deductible_credit": 1036500.00,
  "brokerage_deduction": -129562.50,
  "net_premium": 906937.50
}
\`\`\``
    },
    {
      progress: 90,
      delayMs: 1800,
      message: `→ \`apply_reinsurance_check\`
\`\`\`json
{ "limit": 10000000, "currency": "USD", "retention_check": true }
\`\`\`
✓ Limit USD 10M is within facultative reinsurance capacity. XL treaty applicable above USD 5M.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Premium Calculation — Complete**

| Component | Amount (USD) |
|---|---|
| Gross Premium (100%) | $1,045,000.00 |
| Deductible Credit (USD 10K) | −$8,500.00 |
| Brokerage (12.5%) | −$129,562.50 |
| **Net Premium** | **$906,937.50** |

Reinsurance: XL treaty covers USD 5M+ exposure. Proceeding to email draft.`
    }
  ],

  // ─── Email Draft Agent ────────────────────────────────────────────────────
  drafter: [
    {
      progress: 16,
      delayMs: 1800,
      message: `**Thinking:** Premium calculated at USD 906,937.50 net. Drafting quote confirmation to reinsured (John Doe) with coverage summary, terms, and action items. Pulling standard London market terms template.`
    },
    {
      progress: 32,
      delayMs: 2200,
      message: `→ \`get_email_template\`
\`\`\`json
{
  "template_id": "LLOYDS_QUOTE_LETTER_v4",
  "market": "london",
  "language": "en-GB"
}
\`\`\`
Loading London market quote letter template...`
    },
    {
      progress: 50,
      delayMs: 2400,
      message: `✓ \`get_email_template\` returned template with 12 merge fields.

→ \`compose_email\`
\`\`\`json
{
  "to": "submissions@jdoe-reinsurance.com",
  "subject": "Quote — ${ticketKey} — ABC Private Limited — All Risks Reinsurance",
  "original_insured": "ABC Private Limited",
  "reinsured": "John Doe",
  "limit": "USD 10,000,000",
  "net_premium": "USD 906,937.50",
  "coverage": "All Risks excl. natural perils sublimits",
  "inception": "30/11/2024",
  "valid_until": "28/04/2026"
}
\`\`\`
Composing personalised quote email...`
    },
    {
      progress: 72,
      delayMs: 2000,
      message: `✓ \`compose_email\` returned draft (831 words, 1 attachment linked).

→ \`validate_email_content\`
\`\`\`json
{ "check_regulatory_disclosures": true, "check_gdpr_footer": true, "check_premium_accuracy": true }
\`\`\`
Running compliance validation on email draft...`
    },
    {
      progress: 90,
      delayMs: 1800,
      message: `✓ \`validate_email_content\` returned:
\`\`\`json
{
  "regulatory_disclosures": "PASS",
  "gdpr_footer": "PASS",
  "premium_accuracy": "PASS",
  "word_count": 831,
  "attachments": ["${slipFilename}"],
  "ready_to_send": true
}
\`\`\``
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Email Draft — Complete**

Draft prepared for human review:
- **To:** submissions@jdoe-reinsurance.com (John Doe)
- **Subject:** Quote — ${ticketKey} — ABC Private Limited — All Risks Reinsurance
- Net premium quoted: **USD 906,937.50**
- Attachments: ${slipFilename}
- Compliance: PASS · GDPR footer: PASS

Awaiting underwriter approval before sending.`
    }
  ],

  // ─── Email Sender Agent ───────────────────────────────────────────────────
  sender: [
    {
      progress: 20,
      delayMs: 1600,
      message: `**Thinking:** Email draft approved. Sending quote confirmation to John Doe. Will verify SMTP delivery, update Jira ticket status, and log communication record.`
    },
    {
      progress: 45,
      delayMs: 2000,
      message: `→ \`send_email\`
\`\`\`json
{
  "to": "submissions@jdoe-reinsurance.com",
  "from": "underwriting@exlservice.com",
  "subject": "Quote — ${ticketKey} — ABC Private Limited — All Risks Reinsurance",
  "attachments": ["${slipFilename}"],
  "priority": "normal",
  "request_read_receipt": false
}
\`\`\`
Sending via SMTP relay...`
    },
    {
      progress: 70,
      delayMs: 1800,
      message: `✓ \`send_email\` returned:
\`\`\`json
{
  "message_id": "<20260314104515.93821@exlservice.com>",
  "status": "delivered",
  "timestamp": "2026-03-14T10:45:15Z",
  "recipient_server": "mx.jdoe-reinsurance.com",
  "delivery_time_ms": 389
}
\`\`\``
    },
    {
      progress: 88,
      delayMs: 1600,
      message: `→ \`update_jira_ticket\`
\`\`\`json
{
  "ticket_id": ${ticketKey},
  "status": "Quote Sent",
  "comment": "Quote dispatched to John Doe (submissions@jdoe-reinsurance.com). Net premium USD 906,937.50. Valid 30 days. UMR: B1222PK1621445.",
  "add_label": "quote-sent"
}
\`\`\`
✓ Jira ticket ${ticketKey} updated to **Quote Sent** status.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Email Sent — Complete**

- Delivered to: submissions@jdoe-reinsurance.com at 10:45 UTC
- Message ID: 20260314104515.93821
- Jira ticket ${ticketKey}: updated to **Quote Sent**
- Quote valid until: 13/04/2026`
    }
  ],

  // ─── Final Decision Agent ─────────────────────────────────────────────────
  decider: [
    {
      progress: 15,
      delayMs: 2000,
      message: `**Thinking:** All agents completed. Compiling final underwriting decision for ${ticketKey} (ABC Private Limited / Ecuador All Risks). Reviewing risk scores, sanctions result, premium adequacy, and portfolio impact.`
    },
    {
      progress: 35,
      delayMs: 2200,
      message: `→ \`compile_uw_summary\`
\`\`\`json
{
  "ticket_id": ${ticketKey},
  "agents_completed": ["extractor", "sanctions", "calculator", "drafter", "sender"],
  "include_risk_scores": true,
  "include_premium_breakdown": true
}
\`\`\`
Aggregating outputs from all workflow agents...`
    },
    {
      progress: 58,
      delayMs: 2000,
      message: `✓ \`compile_uw_summary\` returned:
\`\`\`json
{
  "sanctions_result": "PASS",
  "extraction_confidence": 0.94,
  "gross_premium": 1045000,
  "net_premium": 906937.50,
  "minimum_acceptable_premium": 790000,
  "premium_adequacy": "ADEQUATE",
  "reinsurance_required": true,
  "portfolio_impact": "MEDIUM"
}
\`\`\``
    },
    {
      progress: 78,
      delayMs: 1800,
      message: `→ \`evaluate_uw_decision\`
\`\`\`json
{
  "sanctions_clear": true,
  "premium_adequate": true,
  "within_appetite": true,
  "referral_required": false,
  "decision_criteria": "standard_authority"
}
\`\`\`
**Thinking:** All criteria met. Net premium USD 906,937.50 is 14.8% above minimum. No referral triggers. Proceeding to bind recommendation.`
    },
    {
      progress: 95,
      delayMs: 1600,
      message: `→ \`record_decision\`
\`\`\`json
{
  "ticket_id": ${ticketKey},
  "decision": "ACCEPT",
  "basis": "Standard underwriting authority — all criteria satisfied",
  "net_premium": 906937.50,
  "currency": "USD",
  "binding_authority": "UW-AUTHORITY-LVL2",
  "decision_timestamp": "2026-03-14T10:52:00Z"
}
\`\`\`
✓ Decision recorded in underwriting system. Jira updated.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Final Underwriting Decision — Complete**

**Decision: ACCEPT**

| Summary | Value |
|---|---|
| Original Insured | ABC Private Limited |
| Reinsured | John Doe |
| Limit (100%) | USD 10,000,000 |
| Net Premium | USD 906,937.50 |
| Sanctions | PASS |
| Premium Adequacy | ADEQUATE (+14.8%) |
| Authority Level | Standard (Level 2) |

Workflow complete. Jira ticket ${ticketKey} updated to **Accepted — Quote Sent**.`
    }
  ],

  // ─── Field Comparison / Mismatch Summary Agent ────────────────────────────
  mismatch_summarizer: [
    {
      progress: 18,
      delayMs: 1800,
      message: `**Thinking:** Comparing extracted submission fields against the reference data in the Jira ticket. Looking for value mismatches, missing mandatory fields, and confidence flags below threshold.`
    },
    {
      progress: 38,
      delayMs: 2200,
      message: `→ \`fetch_reference_data\`
\`\`\`json
{ "ticket_id": ${ticketKey}, "source": "jira_custom_fields", "schema": "london_market_slip_v3" }
\`\`\`
Fetching reference field values from Jira custom fields...`
    },
    {
      progress: 58,
      delayMs: 2000,
      message: `→ \`compare_fields\`
\`\`\`json
{
  "extracted": {
    "original_insured": "ABC Private Limited",
    "limit": 10000000,
    "inception_date": "2024-11-30",
    "coverage_form": "All Risks"
  },
  "reference": {
    "original_insured": "ABC Private Limited",
    "limit": 10000000,
    "inception_date": "2024-11-30",
    "coverage_form": "All Risks"
  },
  "tolerance": { "date": "1 day" }
}
\`\`\`
Running field-by-field comparison...`
    },
    {
      progress: 80,
      delayMs: 1800,
      message: `✓ \`compare_fields\` returned:
\`\`\`json
{
  "total_fields_checked": 18,
  "exact_matches": 17,
  "within_tolerance": 0,
  "mismatches": 1,
  "mismatch_detail": [
    {
      "field": "reinsured_contact_email",
      "extracted": "",
      "reference": "j.doe@reinsurance.com",
      "severity": "low"
    }
  ]
}
\`\`\``
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Field Comparison — Complete**

- Fields checked: 18
- Exact matches: 17 (94.4%)
- Within tolerance: 0
- Mismatches: 1 (low severity)

**Mismatch:** reinsured_contact_email was not extracted from the slip (field blank on page 1). Reference value: j.doe@reinsurance.com.

**Recommendation:** Minor — manually populate contact email before final send. No blockers to proceed.`
    }
  ]
  }; // end returned steps object
} // end getJiraAgentSteps

// Backwards-compat shim: pre-built with placeholder values for cases where
// no ticket context is available (should not normally be reached).
export const jiraAgentSteps = getJiraAgentSteps('TICKET', 'New Reinsurance Submission');
