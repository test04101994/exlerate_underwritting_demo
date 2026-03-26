/**
 * Realistic agentic step messages for each insurance workflow agent.
 * Each step has a message (shown in chat) and a delayMs (wait before next step).
 * Messages simulate real tool calls, thinking blocks, and responses.
 *
 * SPEED CONFIG: Edit AGENT_SPEED_MULTIPLIER in server/demo-config.ts
 *   0.25 = very fast, 0.5 = fast, 1.0 = normal, 1.5 = slow, 2.0 = very slow
 */
export { AGENT_SPEED_MULTIPLIER } from './demo-config';

export interface AgentStep {
  message: string;
  delayMs: number;
  progress: number;
}

export const insuranceAgentSteps: Record<string, AgentStep[]> = {

  geocoding: [
    {
      progress: 15,
      delayMs: 1800,
      message: `**Thinking:** Extracted address from policy document: *842 Elmwood Drive, Pasadena, CA 91104*. Geocoding to lat/lng, validating county boundary, and looking up FEMA flood zone classification.`
    },
    {
      progress: 30,
      delayMs: 2200,
      message: `→ \`geocode_address\`
\`\`\`json
{ "address": "842 Elmwood Drive, Pasadena, CA 91104" }
\`\`\`
Querying Google Geocoder API...`
    },
    {
      progress: 45,
      delayMs: 1600,
      message: `✓ \`geocode_address\` returned:
\`\`\`json
{
  "lat": 34.1478,
  "lng": -118.1445,
  "formatted_address": "842 Elmwood Dr, Pasadena, CA 91104, USA",
  "county": "Los Angeles County",
  "geocode_confidence": 0.99,
  "plus_code": "85633P5G+87"
}
\`\`\``
    },
    {
      progress: 62,
      delayMs: 2000,
      message: `→ \`lookup_flood_zone\`
\`\`\`json
{ "lat": 34.1478, "lng": -118.1445, "fips": "06037" }
\`\`\`
Querying FEMA National Flood Hazard Layer...`
    },
    {
      progress: 78,
      delayMs: 1800,
      message: `✓ \`lookup_flood_zone\` returned:
\`\`\`json
{
  "flood_zone": "X",
  "flood_zone_description": "Area of minimal flood hazard",
  "firm_panel": "06037C1625G",
  "effective_date": "2008-09-26",
  "special_flood_hazard": false
}
\`\`\``
    },
    {
      progress: 91,
      delayMs: 1400,
      message: `→ \`validate_zip_county\`
\`\`\`json
{ "zip": "91104", "county": "Los Angeles County", "state": "CA" }
\`\`\`
✓ ZIP/county cross-reference validated. No discrepancies.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Geocoding & Address Validation — Complete**

**Results:**
- Coordinates: 34.1478°N, 118.1445°W
- County: Los Angeles County, CA
- Flood Zone: **X** (minimal hazard — no SFHA)
- Address verified against USPS database
- Confidence: **99%**`
    }
  ],

  property_data: [
    {
      progress: 12,
      delayMs: 2000,
      message: `**Thinking:** Geocoded coordinates available (34.1478, -118.1445). Fetching enriched building characteristics from CoStar, estimating replacement cost via Marshall & Swift, and pulling parcel data from LA County Assessor.`
    },
    {
      progress: 28,
      delayMs: 2400,
      message: `→ \`costar_property_lookup\`
\`\`\`json
{ "lat": 34.1478, "lng": -118.1445, "radius_ft": 50 }
\`\`\`
Querying CoStar commercial property database...`
    },
    {
      progress: 44,
      delayMs: 2000,
      message: `✓ \`costar_property_lookup\` returned:
\`\`\`json
{
  "apn": "5727-018-014",
  "building_sqft": 2840,
  "lot_sqft": 7200,
  "year_built": 1987,
  "stories": 2,
  "construction_class": "V-B",
  "roof_type": "Composition Shingle",
  "roof_year": 2017,
  "occupancy": "Single Family Residential",
  "garage": "Attached 2-car (480 sqft)"
}
\`\`\``
    },
    {
      progress: 60,
      delayMs: 2200,
      message: `→ \`estimate_replacement_cost\`
\`\`\`json
{
  "sqft": 2840,
  "construction_type": "Wood Frame Stucco",
  "quality_grade": "Good",
  "zip": "91104",
  "year_built": 1987
}
\`\`\`
Running Marshall & Swift cost estimator...`
    },
    {
      progress: 75,
      delayMs: 1800,
      message: `✓ \`estimate_replacement_cost\` returned:
\`\`\`json
{
  "base_replacement_cost": 851200,
  "cost_per_sqft": 299.72,
  "local_cost_index": 1.18,
  "depreciation_factor": 0.82,
  "insured_to_value_ratio": 1.028
}
\`\`\`
**Thinking:** ITV ratio is 1.028 — coverage is adequate at $875,000.`
    },
    {
      progress: 90,
      delayMs: 1600,
      message: `→ \`get_parcel_attributes\`
\`\`\`json
{ "apn": "5727-018-014", "county_fips": "06037" }
\`\`\`
✓ LA County Assessor: Assessed value $612,400 · Owner-occupied · No open permits · No active liens`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Property Data Agent — Complete**

**Building Profile:**
- 2,840 sqft · 2 stories · Built 1987 · Wood Frame Stucco
- Roof: Composition Shingle (2017) — **8 years old, Good condition**
- Plumbing: Copper/PVC · Wiring: Copper (updated 2010) · Heating: Central Gas
- Amenities: In-ground pool · 2-car garage · Security alarm
- Replacement cost estimate: **$851,200** — ITV ratio 102.8%
- Parcel APN: 5727-018-014 · No open permits`
    }
  ],

  geospatial_risk: [
    {
      progress: 14,
      delayMs: 2200,
      message: `**Thinking:** Property is in Pasadena, CA — a Foothill community adjacent to the San Gabriel Mountains with elevated wildfire exposure. Running wildfire proximity analysis, seismic zone check, slope/terrain evaluation, and emergency services proximity.`
    },
    {
      progress: 30,
      delayMs: 2600,
      message: `→ \`get_wildfire_risk_score\`
\`\`\`json
{
  "lat": 34.1478,
  "lng": -118.1445,
  "model": "FSIM3_v2",
  "include_sra_overlay": true
}
\`\`\`
Running CAL FIRE State Responsibility Area analysis + FireLine model...`
    },
    {
      progress: 46,
      delayMs: 2000,
      message: `✓ \`get_wildfire_risk_score\` returned:
\`\`\`json
{
  "fsim_score": 67,
  "risk_tier": "High",
  "sra_designation": "SRA High Fire Hazard Zone",
  "distance_to_sra_boundary_miles": 1.4,
  "vegetation_class": "Moderate",
  "slope_pct": 12,
  "aspect": "SW"
}
\`\`\`
[Warning] SRA High Fire Hazard — 1.4 miles from boundary. Brush clearance requirement applies.`
    },
    {
      progress: 60,
      delayMs: 2000,
      message: `→ \`get_seismic_risk\`
\`\`\`json
{ "lat": 34.1478, "lng": -118.1445, "standard": "USGS_NSHM_2023" }
\`\`\`
✓ USGS Seismic Hazard: **Zone 4 (High)** · Peak Ground Acceleration 0.46g (2% in 50yr) · Distance to nearest active fault: **6.2 miles (Sierra Madre)**`
    },
    {
      progress: 74,
      delayMs: 1800,
      message: `→ \`proximity_analysis\`
\`\`\`json
{ "lat": 34.1478, "lng": -118.1445, "layers": ["fire_stations", "police", "hospitals"] }
\`\`\`
✓ Results:
- Nearest fire station: **1.2 miles** (Pasadena Fire Dept Station 36) — Response est. 4.2 min
- Nearest police: 0.8 miles
- Nearest hospital: 2.1 miles (Huntington Hospital)`
    },
    {
      progress: 90,
      delayMs: 1600,
      message: `→ \`score_geospatial_risk\`
\`\`\`json
{
  "wildfire_score": 67,
  "seismic_zone": 4,
  "flood_zone": "X",
  "fire_response_min": 4.2,
  "slope_pct": 12
}
\`\`\`
**Thinking:** Elevated wildfire risk is the dominant factor. Applying 1.08x geospatial multiplier.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Geospatial Risk Assessment — Complete**

| Risk Factor | Score | Status |
|---|---|---|
| Wildfire | High (67/100) | SRA Zone |
| Seismic | High (Zone 4) | 0.46g PGA |
| Flood | Minimal (Zone X) | Clear |
| Fire Response | 4.2 min | Acceptable |

**Geospatial Risk Multiplier: 1.08x**`
    }
  ],

  cat_risk: [
    {
      progress: 14,
      delayMs: 2400,
      message: `**Thinking:** Running catastrophe models for this Pasadena property. Primary CAT peril: wildfire (Foothill zone). Secondary: earthquake (Zone 4). Hurricane not applicable for CA inland. Will run RMS RiskLink for wildfire and AIR Touchstone for earthquake.`
    },
    {
      progress: 28,
      delayMs: 2800,
      message: `→ \`run_cat_model\`
\`\`\`json
{
  "model": "RMS_RiskLink_21",
  "peril": "WILDFIRE",
  "lat": 34.1478,
  "lng": -118.1445,
  "tiv": 875000,
  "construction": "wood_frame",
  "year_built": 1987
}
\`\`\`
Executing RMS RiskLink wildfire simulation (10,000 event trials)...`
    },
    {
      progress: 45,
      delayMs: 2400,
      message: `✓ \`run_cat_model\` (WILDFIRE) returned:
\`\`\`json
{
  "aal": 3281,
  "pml_100yr": 52500,
  "pml_250yr": 148750,
  "ep_1pct": 175000,
  "vulnerability_score": 0.42,
  "peril_multiplier": 1.08
}
\`\`\`
**AAL Wildfire: $3,281/yr · 100yr PML: $52,500**`
    },
    {
      progress: 60,
      delayMs: 2600,
      message: `→ \`run_cat_model\`
\`\`\`json
{
  "model": "AIR_Touchstone_10",
  "peril": "EARTHQUAKE",
  "lat": 34.1478,
  "lng": -118.1445,
  "tiv": 875000,
  "construction": "wood_frame",
  "soil_class": "D",
  "stories": 2
}
\`\`\`
Executing AIR Touchstone earthquake simulation...`
    },
    {
      progress: 76,
      delayMs: 2000,
      message: `✓ \`run_cat_model\` (EARTHQUAKE) returned:
\`\`\`json
{
  "aal": 4812,
  "pml_100yr": 87500,
  "pml_250yr": 262500,
  "soil_amplification": 1.22,
  "peril_multiplier": 1.04
}
\`\`\`
[Note] Earthquake is EXCLUDED from this policy (endorsement HO-305 not attached). CAT model run for underwriting record only.`
    },
    {
      progress: 91,
      delayMs: 1600,
      message: `→ \`aggregate_cat_loading\`
\`\`\`json
{ "covered_perils": ["WILDFIRE"], "excluded_perils": ["EARTHQUAKE"], "tiv": 875000 }
\`\`\`
**Thinking:** Only wildfire loading applies. Combined CAT loading = 1.08x. Total AAL for covered perils = $3,281.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Catastrophe Risk Evaluation — Complete**

| Peril | AAL | 100yr PML | Status |
|---|---|---|---|
| Wildfire | $3,281 | $52,500 | Covered |
| Earthquake | $4,812 | $87,500 | Excluded |
| Flood | Minimal | — | Zone X Clear |

**CAT Loading Multiplier: 1.08x** (wildfire only)
Recommended: Maintain $2,500 all-peril deductible. Consider optional EQ endorsement offer.`
    }
  ],

  portfolio_risk: [
    {
      progress: 16,
      delayMs: 1800,
      message: `**Thinking:** Checking portfolio concentration in ZIP 91104 (Pasadena) and Los Angeles County. If existing exposure in this SRA wildfire zone is near threshold, a concentration loading applies.`
    },
    {
      progress: 32,
      delayMs: 2200,
      message: `→ \`query_portfolio_exposure\`
\`\`\`json
{
  "zip": "91104",
  "county_fips": "06037",
  "peril": "WILDFIRE",
  "product_line": "homeowners"
}
\`\`\`
Querying portfolio management system...`
    },
    {
      progress: 50,
      delayMs: 2000,
      message: `✓ \`query_portfolio_exposure\` returned:
\`\`\`json
{
  "zip_91104_policy_count": 34,
  "zip_91104_tiv_m": 22.4,
  "county_06037_policy_count": 1847,
  "county_06037_tiv_m": 1620.8,
  "sra_zone_pct_of_book": 8.4
}
\`\`\``
    },
    {
      progress: 66,
      delayMs: 2000,
      message: `→ \`calculate_concentration_loading\`
\`\`\`json
{
  "zip_tiv_m": 22.4,
  "county_tiv_m": 1620.8,
  "new_tiv": 875000,
  "concentration_threshold_zip_m": 25.0,
  "concentration_threshold_county_m": 2000.0
}
\`\`\`
**Thinking:** ZIP 91104 TIV is $22.4M, adding this policy brings it to $23.3M — still under the $25M ZIP threshold. County at $1.62B, well under $2B limit. No concentration loading required.`
    },
    {
      progress: 82,
      delayMs: 1800,
      message: `→ \`check_underwriting_guidelines\`
\`\`\`json
{
  "state": "CA",
  "product": "HO-3",
  "year_built": 1987,
  "construction": "wood_frame",
  "coverage_a": 875000
}
\`\`\`
✓ Underwriting guidelines: **ELIGIBLE** — all criteria met. No referral required.`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Portfolio Concentration Analysis — Complete**

- ZIP 91104 exposure: $22.4M → $23.3M after bind (93% of threshold)
- LA County exposure: $1.62B (81% of threshold)
- SRA wildfire zone: 8.4% of book (within guideline limits)

**Concentration Multiplier: 1.00x** (no loading applied)
**Underwriting eligibility: APPROVED**`
    }
  ],

  quote_generator: [
    {
      progress: 12,
      delayMs: 2000,
      message: `**Thinking:** Synthesizing premium from all upstream agents:
- Base dwelling + liability premium
- CAT loading: 1.08x (wildfire)
- Geospatial loading: 1.08x (applied to dwelling only)
- Concentration loading: 1.00x (none)
- Discounts: multi-policy, alarm, new roof`
    },
    {
      progress: 26,
      delayMs: 2400,
      message: `→ \`calculate_base_premium\`
\`\`\`json
{
  "coverage_a": 875000,
  "coverage_c": 350000,
  "coverage_e": 300000,
  "deductible": 2500,
  "construction": "wood_frame",
  "year_built": 1987,
  "state": "CA",
  "territory": "10B"
}
\`\`\`
Running ISO GL rating algorithm...`
    },
    {
      progress: 42,
      delayMs: 2200,
      message: `✓ \`calculate_base_premium\` returned:
\`\`\`json
{
  "dwelling_base": 2148.00,
  "liability_base": 210.00,
  "base_total": 2358.00
}
\`\`\``
    },
    {
      progress: 57,
      delayMs: 2000,
      message: `→ \`apply_risk_multipliers\`
\`\`\`json
{
  "base_premium": 2148.00,
  "cat_multiplier": 1.08,
  "geospatial_multiplier": 1.08,
  "concentration_multiplier": 1.00
}
\`\`\`
✓ Adjusted dwelling premium: **$2,504.50** (after CAT + geospatial loadings)`
    },
    {
      progress: 70,
      delayMs: 2000,
      message: `→ \`add_endorsement_premiums\`
\`\`\`json
{
  "endorsements": [
    { "code": "HO-61", "premium": 312.00 },
    { "code": "HO-77", "premium": 180.00 },
    { "code": "HO-91", "premium": 95.00 },
    { "code": "HO-112", "premium": 45.00 },
    { "code": "HO-201", "premium": 220.00 },
    { "code": "HO-215", "premium": 165.00 }
  ]
}
\`\`\`
✓ Endorsement subtotal: **$1,017.00**`
    },
    {
      progress: 84,
      delayMs: 1800,
      message: `→ \`apply_discounts\`
\`\`\`json
{
  "multi_policy": -185.00,
  "protective_device": -68.00,
  "new_roof": -112.00
}
\`\`\`
✓ Total discounts: **-$365.00**

→ \`add_taxes_and_fees\`
\`\`\`json
{ "subtotal": 3156.50, "ca_surplus_lines_tax_pct": 3.0, "stamping_fee_pct": 0.25, "policy_fee": 35.00 }
\`\`\`
✓ Taxes & fees: **$132.83** (CA surplus lines 3.0% + stamping 0.25% + $35 policy fee)`
    },
    {
      progress: 95,
      delayMs: 2000,
      message: `→ \`generate_pdf_quote\`
\`\`\`json
{
  "insured": "Robert J. Harrington & Elena M. Harrington",
  "property": "842 Elmwood Drive, Pasadena, CA 91104",
  "total_premium": 3289.33,
  "effective_date": "03/15/2024",
  "carrier": "Pinnacle Mutual Insurance Group"
}
\`\`\`
Generating PDF quote document...`
    },
    {
      progress: 100,
      delayMs: 0,
      message: `**Quote Generation — Complete**

---
**PROPERTY INSURANCE QUOTE**
**Insured:** Robert J. Harrington & Elena M. Harrington
**Property:** 842 Elmwood Drive, Pasadena, CA 91104

| Component | Amount |
|---|---|
| Base Premium (Dwelling A–D) | $2,504.50 |
| Liability (E–F) | $210.00 |
| Endorsements | $1,017.00 |
| Multi-Policy Discount | -$185.00 |
| Alarm Credit | -$68.00 |
| New Roof Credit | -$112.00 |
| CA Surplus Lines Tax (3%) | $90.30 |
| Stamping Fee (0.25%) | $7.53 |
| Policy Fee | $35.00 |
| **TOTAL ANNUAL PREMIUM** | **$3,499.33** |

**Risk Adjustments:** CAT 1.08x · Geospatial 1.08x · Concentration 1.00x
**Quote valid 30 days · Effective 03/15/2024**

[PDF_DOWNLOAD:/api/quote/download:Insurance_Quote_Harrington.pdf]`
    }
  ]
};
