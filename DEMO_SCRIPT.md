# EXLerate AI — Client Demo Script

> **Before the demo**
> - Open the app in a browser at full-screen
> - Make sure at least one existing case is on the dashboard (e.g. James & Patricia Harrington)
> - Have the Jira ticket XSX-4333 ready in a separate tab (optional, for context)
> - Keep this script visible on a second monitor or printed

---

## PART 1 — Insurance Submission Workflow
### "From Broker Submission to Underwriting Decision in Minutes"

---

### Opening (30 seconds)

> "What you're looking at is EXLerate AI — an AI-powered underwriting operations platform.
> Today I'll walk you through two real workflows our system handles end-to-end:
> a property insurance submission, and a Lloyd's reinsurance slip.
> Both are fully automated, with humans staying in control at key decision points."

---

### Step 1 — Show the Dashboard (1 minute)

**Point to the dashboard.**

> "This is the underwriting dashboard. Each card represents a live insurance case —
> you can see the case ID, the insured's name, which AI agent is currently working on it,
> how far along it is, the assigned underwriter, and the broker contact."

**Point to the existing case card (e.g. Harrington).**

> "This case — James & Patricia Harrington — is a property submission that came in
> from broker Gallagher. The system automatically picked it up,
> created a case, and kicked off the agent pipeline. The broker email,
> policy type, and priority were all captured without any manual entry."

---

### Step 2 — Create a New Case (2 minutes)

**Click "New Case" button.**

> "Let me show you how a new case enters the system.
> An underwriter or operations staff can create a case manually — or it can come in
> automatically from an email integration. Either way, the intake form is simple."

**Click "Demo data" (wand icon) to auto-fill.**

> "I'll use our sample data so we don't waste time typing. This is a new submission for
> Eleanor and Thomas Whitfield — a detached Edwardian property with an annexe,
> existing policy expiring 30 June. The broker is Gallagher Re, priority is High,
> assigned to Sarah Mitchell."

**Optionally upload a PDF document.**

> "You can attach the original submission document — a PDF or DOCX.
> The agents read it directly. No manual data entry."

**Click "Create Case".**

> "One click. The case is now live on the dashboard."

**Point to the new card appearing.**

> "It shows up immediately with a generated case ID,
> and the first agent — Policy Data Extraction — is already queued."

---

### Step 3 — Open the Workflow & Walk Through the Agents (3–4 minutes)

**Click on an existing case with a running workflow (e.g. Okafor, status: processing).**

> "Let me open a case that's already in progress so you can see the full pipeline."

**Point to the Agent Registry panel on the left.**

> "On the left is the Agent Registry — seven specialist AI agents running in sequence.
> Each one has a specific job. Let me walk you through them."

---

**Agent 1 — Policy Data Extraction Agent**

> "The first agent reads the uploaded insurance policy document and extracts every
> underwriting attribute automatically: property address, coverage types, coverage limits,
> sum insured, policy period, and all other key fields.
> No one types any of this. The agent does it in seconds."

*Why it matters:*
> "Manual data entry from submission documents typically takes 20–40 minutes per case
> and introduces errors. This agent eliminates that entirely."

---

**Agent 2 — Geocoding & Address Validation Agent**

> "Before any risk analysis begins, this agent validates the property address.
> It calls the Google Geocoder API to pin the property to exact latitude/longitude coordinates,
> confirms the ZIP code and county match, and queries the FEMA National Flood Hazard Layer
> for flood zone classification.
> For this property: Flood Zone X — minimal flood hazard. Address confidence 99%."

*Why it matters:*
> "An incorrect address means wrong risk scoring, wrong premium, and potential claim disputes.
> This agent catches address errors before the workflow proceeds."

---

**Agent 3 — Property Data Agent**

> "This agent enriches the submission by fetching live property data from CoStar —
> a commercial real estate data platform used across the industry.
> It pulls building size, age, roof age, construction type, occupancy classification,
> and tenant details.
> The underwriter doesn't need to manually look any of this up."

*Why it matters:*
> "Underwriters spend hours researching property attributes from multiple sources.
> This agent delivers it all in one structured result in under 30 seconds."

---

**Agent 4 — Geospatial Risk Assessment Agent**

> "This is one of the most analytically powerful agents in the pipeline.
> It evaluates the property against multiple geospatial risk layers simultaneously:
>
> — **Wildfire risk**: Uses the CAL FIRE State Responsibility Area model and FireLine
>   to score proximity to wildfire-prone zones.
>   For this property: wildfire risk **High — 67/100**, within a State Responsibility Area.
>
> — **Seismic risk**: Queries the USGS seismic hazard database.
>   This property sits in **Seismic Zone 4** — the highest category.
>
> — **Emergency response proximity**: Measures distance to nearest fire station,
>   police station, and hospital — all factors in claims severity and insurability.
>
> Based on the combined geospatial signals, the agent applies a **1.08× geospatial
> risk multiplier** to the base premium."

*Why it matters:*
> "This analysis would normally require a risk engineer spending half a day
> consulting multiple databases and map tools. The agent does it in under a minute
> and produces a fully auditable result."

---

**Agent 5 — Portfolio Concentration Agent**

> "Insurance companies have exposure limits — if too much of their book is concentrated
> in one ZIP code, one county, or one type of risk, a single catastrophe event can
> generate catastrophic losses across the entire portfolio.
>
> This agent queries the portfolio management system and checks how much exposure
> already exists in this property's ZIP code and county.
>
> For ZIP 91104: current portfolio exposure is **USD 22.4M**.
> After binding this risk it would be **USD 23.3M** — that's **93% of the USD 25M threshold**.
> Still within appetite, so **no concentration loading is applied (1.00×)**.
>
> But if a case pushes the concentration above threshold,
> the agent automatically applies a **1.10× loading** to account for the correlated risk."

*Why it matters:*
> "Without this check, underwriters are flying blind on portfolio accumulation.
> Breaching concentration limits has caused significant industry losses — think
> Hurricane Katrina, the 2017 California wildfires. This agent enforces discipline automatically."

---

**Agent 6 — Catastrophe Risk Evaluation Agent**

> "This agent runs full catastrophe models against the property:
>
> — **RMS RiskLink** for wildfire AAL (Average Annual Loss) and PML (Probable Maximum Loss)
> — **AIR Touchstone** for earthquake modelling
>
> For this property:
> Wildfire **AAL: USD 3,281/year**. Wildfire **100-year PML: USD 52,500**.
> Earthquake is excluded under the policy wording, so only wildfire CAT loading applies.
>
> The agent applies a **1.08× CAT loading** to reflect the modelled catastrophe exposure."

*Why it matters:*
> "CAT modelling is typically done by specialist actuaries using expensive licensed software.
> This agent automates the process and embeds the result directly into the pricing workflow —
> consistently, instantly, and with a full audit trail."

---

**Agent 7 — Quote Generation Agent**

> "The final agent synthesises all the outputs from the preceding six agents —
> property data, geospatial risk, portfolio concentration, CAT loading —
> and generates a final insurance quote with a fully itemised premium breakdown.
> The quote is downloadable as a PDF, ready to send to the broker."

*Why it matters:*
> "This is the output the broker is waiting for. Everything that came before feeds into
> this one document. The underwriter reviews the quote, adjusts if necessary, and approves —
> typically in under five minutes."

---

### Step 4 — Show Agent Reasoning (1 minute)

**Point to the chat panel on the right.**

> "On the right you have the agent's live reasoning — every tool call, every decision,
> every extracted value. This is full transparency: the underwriter can see exactly
> what the AI did and why. Nothing is a black box."

**Point to a tool call in the chat.**

> "Here you can see the actual tool being called, the parameters it sent,
> and the structured result it got back. The agent then validates those values
> before writing them to the underwriting form."

---

### Closing — Insurance Workflow (30 seconds)

> "What used to take an underwriting team two to four hours —
> reading the submission, validating the address, researching property data,
> running geospatial checks, CAT modelling, checking portfolio concentration,
> then finally generating a quote —
> now takes under four minutes of machine time.
> The underwriter spends five minutes reviewing and approving.
> That's an 85–90% reduction in handling time per submission."

---
---

## PART 2 — Lloyd's Slip / Jira Reinsurance Workflow
### "From Jira Ticket to Processed Reinsurance Submission in Minutes"

---

### Opening (30 seconds)

> "The second workflow is for London Market reinsurance — specifically Lloyd's facultative slips.
> These are structured differently from personal lines: higher values, more complex coverage,
> and the submission comes in via Jira rather than email."

---

### Step 1 — Navigate to the Jira Workflow

**Navigate to the Jira/Workflow section of the platform.**

> "In this workflow, a reinsurance submission arrives as a Jira ticket.
> The broker or ceding office raises the ticket and attaches the slip document.
> The platform monitors Jira automatically, picks up new tickets,
> and launches the agent pipeline without any manual trigger."

---

### Step 2 — Show the Live Ticket Data (1 minute)

**Point to the ticket details panel.**

> "This is ticket XSX-4333. The insured is ABC Private Limited.
> The risk is All Risks of Direct Physical Loss or Damage Reinsurance —
> a USD 10 million limit, excess of USD 10,000 deductible.
> Policy period 30 November 2024 to 29 November 2025. Location: Ecuador.
> Annual premium at 100% line: USD 1,045,000."

**Point to the attached document.**

> "The slip document — `document (10).pdf` — is attached directly to the Jira ticket.
> The extraction agent reads it directly. No one had to copy and paste any of those figures."

---

### Step 3 — Walk Through the Agent Pipeline (3 minutes)

**Point to each agent in sequence in the Agent Registry.**

> "The Jira reinsurance pipeline has seven specialist agents:"

---

**Agent 1 — Data Extraction Agent**

> "Reads the attached slip PDF or DOCX using LLM-powered document processing.
> Extracts all structured fields: UMR reference, original insured, reinsured entity,
> risk type, limit, deductible, premium, policy period, and cedant details.
> The extraction runs against the raw document — not a template, not a form.
> Any well-structured slip can be processed."

---

**Agent 2 — Quality Assurance Agent**

> "Validates the accuracy and completeness of every extracted field
> against the Policy Administration System.
> If a field is missing, ambiguous, or conflicts with PAS data, it flags it
> before the workflow proceeds — not after.
> This is the AI equivalent of a senior analyst checking a junior's work."

---

**Agent 3 — Data Validation Agent**

> "Runs the pre-submission data quality gate: confirms sanctions pre-checks are clear,
> verifies data completeness against the required field set for PAS integration,
> and ensures no record is written to the system with gaps or errors.
> It acts as the final check before any data touches a downstream system."

---

**Agent 4 — Communication Agent**

> "This agent does something unique — it monitors the Jira ticket continuously
> for human responses: underwriter comments, clarification requests, approval notes.
> When a response is detected, the workflow automatically resumes from where it paused.
>
> So if an underwriter needs to ask the broker a question mid-workflow,
> they add a comment to the Jira ticket. The agent picks it up and continues.
> No manual re-triggering, no lost context."

*Why it matters:*
> "This is how you maintain human oversight without breaking automation.
> The underwriter stays in Jira — their existing tool — and the AI adapts around them."

---

**Agent 5 — Data Transformation Agent**

> "Converts the extracted and validated data into the standardised formats
> required by downstream systems.
> This includes field name mapping, date format normalisation, currency standardisation,
> and any data type conversions needed for PAS ingestion.
> Each integration target can have different format requirements — this agent handles all of them."

---

**Agent 6 — Sanctions Check Agent**

> "Screens all parties in the submission — original insured, reinsured, ceding office,
> and any named intermediaries — against three sanctions lists simultaneously:
> OFAC (US), UN consolidated list, and EU sanctions register.
>
> For this submission: ABC Private Limited — OFAC: clear. UN: clear. EU: clear.
> Screened and cleared in 12 seconds. A full audit trail is produced.
>
> Manually, this is a 20-minute job across multiple portals,
> with the risk of missing an alias or misspelling."

---

**Agent 7 — Integration Agent**

> "The final agent writes the validated, transformed, sanctions-cleared underwriting record
> into the Policy Administration System.
> It then closes the Jira workflow, posts the completion summary back to the ticket,
> and marks the submission as processed.
> The Jira ticket becomes the permanent audit trail for the entire workflow."

---

### Step 4 — Show Agent Reasoning (1 minute)

**Point to a Thinking block in the chat.**

> "Notice the Thinking blocks — these show the agent's internal reasoning before it acts.
> The agent works through the problem the way a senior analyst would,
> before running any tool call.
> This transparency matters: underwriters and compliance teams can audit every decision."

**Point to a tool call result.**

> "And here's the sanctions screening result: OFAC — clear. EU — clear. UN — clear.
> Each list was checked separately, with the full query and response logged."

---

### Step 5 — Jira Writeback (30 seconds)

> "Once the pipeline completes, everything is written back to the Jira ticket —
> the extracted fields, QA results, sanctions clearance, transformation log,
> and PAS integration confirmation.
> The ticket becomes the audit trail. Nothing lives only in a spreadsheet or someone's inbox."

---

### Closing — Jira Workflow (30 seconds)

> "For London Market reinsurance, the manual workflow is:
> broker emails the slip, someone copies it into the system,
> sanctions are checked manually across multiple portals,
> the risk is rated offline, a memo is written, and it goes up for approval.
> That's typically two to four hours of analyst time per submission.
> With EXLerate AI, the analyst reviews a completed file in under ten minutes."

---
---

## Q&A Talking Points

**"How accurate is the data extraction?"**
> "For clean, well-structured PDF slips and policy documents, field accuracy is above 95%.
> The QA Agent validates every field before proceeding — if confidence is low,
> it flags for human review rather than silently passing a bad value."

**"What if the AI gets it wrong?"**
> "The underwriter reviews every extracted value before the workflow proceeds past extraction.
> The approval gates ensure no quote goes out without human sign-off.
> The AI accelerates the work; the underwriter owns the decision."

**"What does the Geospatial Agent actually connect to?"**
> "CAL FIRE State Responsibility Area model, FireLine wildfire risk scores,
> USGS seismic hazard maps, FEMA National Flood Hazard Layer,
> and Google Geocoder for address validation. All via API, in real time."

**"What is the Portfolio Concentration Agent protecting against?"**
> "Correlated risk accumulation — if too many properties in one area are insured,
> a single event like a wildfire or earthquake generates simultaneous claims across the book.
> The agent enforces portfolio limits automatically so no individual underwriter can inadvertently breach them."

**"Can it integrate with our existing systems?"**
> "Yes — the platform is API-first. Jira integration is live.
> Email ingestion, policy administration systems, CoStar, and Lloyd's Crystal can all be connected."

**"Is the data secure?"**
> "All document processing happens within your environment.
> No submission data is sent to a public AI service without your data agreement in place."

**"How long does deployment take?"**
> "A pilot can be running in two to four weeks.
> The main integration points are your email or Jira ingestion and your policy system."

---

## Speed Settings Reference

To adjust demo pacing, edit `server/demo-config.ts`:

| `AGENT_SPEED_MULTIPLIER` | Experience |
|---|---|
| `0.5` | Very fast — testing only |
| `1.0` | Normal |
| `1.5` | **Recommended for live demo** |
| `2.0` | Slow / dramatic |
