"""
AgentCore Hub — multi-agent orchestration on Bedrock AgentCore Runtime.

Exposes HTTP discovery and webhooks, plus a bidirectional WebSocket for chat,
tool streaming, Jira-linked sessions, document upload/ingest, and plan execution.

- **Model / runtime**: Strands Agents SDK + Amazon Nova Lite (Bedrock); tools in ``tools/``
  (see ``tools/__init__.py``).
- **HTTP**: ``GET /agents`` (registry for the UI), ``POST /webhook/jira`` (Jira-style
  events → optional multi-step plans pushed to a session or queue).
- **WebSocket**: JSON messages for chat, ticket binding, PDF ingest, plan approval,
  extraction workflows, and Jira comment drafts; agent output is streamed via a
  per-connection async queue populated by the Strands callback handler.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import uuid

from bedrock_agentcore import BedrockAgentCoreApp
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from strands import Agent
from strands.models.bedrock import BedrockModel

import context
import settings
import state
from data_extraction import load_extraction_state, approve_extraction, reject_extraction, update_field_status
from jira_comment_draft import list_pending_drafts
from tools import ALL_AGENT_TOOLS, CALCULATOR_TOOLS
from tools.doc_analysis import ingest_pdf_from_s3
from tools.jira_client import call_jira_api, post_jira_comment_v3

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("agentcore")

_thread_ctx = context._thread_ctx


def _jira_draft_ws_payload(d: dict) -> dict:
    """Build a WebSocket message for a draft (email or Jira comment) in the agent-testing UI.

    The ``type`` field remains ``email_draft`` for backward compatibility with the frontend.
    """
    payload = {
        "type": "email_draft",
        "draftId": d["draft_id"],
        "body": d["draft"],
        "revisionCount": d.get("revision_count", 0),
        "label": d.get("label") or (str(d.get("subject", ""))[:80] if d.get("subject") else ""),
        "ticketKey": d.get("ticket_key") or d.get("submission_id") or "",
    }
    # Include email-specific fields if present
    if d.get("to"):
        payload["to"] = d["to"]
        payload["subject"] = d.get("subject", "")
    return payload


def crypto_id() -> str:
    return uuid.uuid4().hex[:8]


# ── Agent Registry (dynamic discovery) ────────────────────────────────────────

AGENT_REGISTRY = [
    {
        "id": "planner",
        "name": "Planner",
        "description": "Multi-step task planning",
        "icon": "brain",
        "capabilities": [
            "Break complex tasks into steps",
            "Human-in-the-loop approval",
            "Sequential execution",
        ],
        "tools": ["create_plan"],
        "examples": [
            "Get HIS-90 details and summarize its comments",
            "Search open bugs and add a status update to each",
        ],
    },
    {
        "id": "calculator",
        "name": "Calculator",
        "description": "Math operations",
        "icon": "calculator",
        "capabilities": [
            "Arithmetic (+, -, x, \u00f7)",
            "Powers & square roots",
            "Percentages",
        ],
        "tools": ["add", "subtract", "multiply", "divide"],
        "examples": ["What is 25 x 4?", "\u221a144 + 15%"],
    },
    {
        "id": "doc_analysis",
        "name": "Doc Analysis",
        "description": "PDF document analysis",
        "icon": "file",
        "capabilities": [
            "Upload & analyze PDFs",
            "Answer questions from documents",
            "Extract key information",
        ],
        "tools": ["doc_analysis"],
        "examples": ["Summarize the uploaded document", "What are the key terms?"],
    },
    {
        "id": "jira",
        "name": "Jira",
        "description": "Ticket management",
        "icon": "ticket",
        "capabilities": [
            "Read & search tickets",
            "Read & write comments",
            "Summarize discussions",
        ],
        "tools": ["jira_get_ticket", "jira_get_comments", "jira_add_comment", "jira_search_tickets", "jira_summarize_comments"],
        "examples": ["Get comments on HIS-90", "Summarize discussion on XSX-4113"],
    },
    {
        "id": "reconciliation",
        "name": "Reconciliation Agent",
        "description": "Draft Jira comment summaries",
        "icon": "message-square",
        "capabilities": [
            "AI-generated reconciliation / summary comments",
            "Human review & revision",
            "Post to Jira on approval",
        ],
        "tools": ["draft_jira_comment_summary"],
        "examples": [
            "Draft a reconciliation summary as a Jira comment for HIS-90",
            "Write a summary of limit-of-liability points for the underwriters",
        ],
    },
    {
        "id": "data_extraction",
        "name": "Data Extraction",
        "description": "Extract structured data from PDFs",
        "icon": "scan",
        "capabilities": [
            "Parse PDF documents",
            "Extract fields with bounding boxes",
            "Human validation workflow",
        ],
        "tools": ["extract_data"],
        "examples": [
            "Extract data from the uploaded document",
            "Parse the policy details from the PDF",
        ],
    },
]

SUBMISSIONS_AGENT_REGISTRY = [
    {
        "id": "data_extraction",
        "name": "Data Extraction",
        "description": "Extract insurance fields from PDFs",
        "icon": "scan",
        "capabilities": [
            "Extract policy data from uploaded PDFs",
            "Parse insured name, dates, premiums",
            "Structured field extraction",
        ],
        "tools": ["extract_data"],
        "examples": [
            "Extract data from the uploaded document",
            "Parse the policy details from the PDF",
        ],
    },
    {
        "id": "doc_analysis",
        "name": "Doc Analysis",
        "description": "Analyze and query uploaded documents",
        "icon": "file-search",
        "capabilities": [
            "Answer questions about uploaded documents",
            "Summarize document content",
            "Find specific information in PDFs",
        ],
        "tools": ["doc_analysis"],
        "examples": [
            "What does the uploaded document say about coverage?",
            "Summarize the key terms in this policy",
        ],
    },
    {
        "id": "sanctions_checker",
        "name": "Sanctions Checker",
        "description": "Screen insured entities against GLEIF registry",
        "icon": "shield",
        "capabilities": [
            "Check insured name against GLEIF database",
            "Verify legal entity identifiers (LEI)",
            "Flag entities for sanctions review",
        ],
        "tools": ["sanctions_checker"],
        "examples": [
            "Run a sanctions check on the insured",
            "Check the insured entity against GLEIF",
        ],
    },
    {
        "id": "email_drafter",
        "name": "Email Drafter",
        "description": "Draft and send emails via SES",
        "icon": "mail",
        "capabilities": [
            "Draft professional emails",
            "Review and revise before sending",
            "Send via AWS SES on approval",
        ],
        "tools": ["draft_email"],
        "examples": [
            "Draft an email to the broker requesting more info",
            "Send a follow-up email about the policy quote",
        ],
    },
    {
        "id": "premium_calculator",
        "name": "Premium Generator",
        "description": "Generate premium quotes for submissions",
        "icon": "dollar-sign",
        "capabilities": [
            "Calculate indicative premiums",
            "Generate premium breakdowns",
            "Quote with taxes and fees",
        ],
        "tools": ["generate_premium"],
        "examples": [
            "Generate a premium for this submission",
            "What's the premium quote?",
        ],
    },
    {
        "id": "submission_summary",
        "name": "Submission Summary",
        "description": "Summarize submission details from S3",
        "icon": "clipboard-list",
        "capabilities": [
            "Summarize email and attachments",
            "Show extracted fields overview",
            "Full submission at a glance",
        ],
        "tools": ["submission_summary"],
        "examples": [
            "Summarize this submission",
            "Give me an overview of this case",
        ],
    },
    {
        "id": "cross_sell",
        "name": "Cross-Sell Analysis",
        "description": "Identify coverage gaps and upsell opportunities",
        "icon": "trending-up",
        "capabilities": [
            "Detect coverage gaps from extraction data",
            "Analyze claims history for risk patterns",
            "Recommend coverages with premium estimates",
        ],
        "tools": ["cross_sell_analysis"],
        "examples": [
            "Run a cross-sell analysis for this submission",
            "What coverage gaps exist for this risk?",
        ],
    },
    {
        "id": "peer_comparison",
        "name": "Peer Comparison",
        "description": "Benchmark submission against similar risks",
        "icon": "bar-chart-2",
        "capabilities": [
            "Find similar risks in the book of business",
            "Compare premium, loss ratio, deductibles",
            "Benchmark positioning vs peer group",
        ],
        "tools": ["peer_comparison"],
        "examples": [
            "How does this compare to similar risks?",
            "Run a peer comparison",
        ],
    },
]

from tools.sanctions_checker import sanctions_checker
from tools.email_draft_tool import draft_email
from tools.premium_calculator import generate_premium
from tools.submission_summary import submission_summary
from tools.cross_sell_analysis import cross_sell_analysis
from tools.peer_comparison import peer_comparison
SUBMISSIONS_TOOLS = [t for t in ALL_AGENT_TOOLS if t.__name__ in ("extract_data", "doc_analysis")] + [sanctions_checker, draft_email, generate_premium, submission_summary, cross_sell_analysis, peer_comparison]

SUBMISSIONS_SYSTEM_PROMPT = """You are an AI Assistant for the New Business Submissions workflow.
You help underwriters with calculations, document analysis, data extraction, and sanctions screening.

Available tools: extract_data, doc_analysis, sanctions_checker, draft_email, generate_premium, submission_summary, cross_sell_analysis, peer_comparison.

RULES:
- For document extraction requests, use extract_data tool immediately.
- For questions about uploaded documents, use doc_analysis tool.
- For sanctions checks, ALWAYS call the sanctions_checker tool immediately. It reads the insured name directly from S3 extraction data — no document upload is needed.
- For email drafting, use the draft_email tool. It generates a draft for review — the user can approve to send or revise with feedback.
- For premium quotes, use generate_premium. It reads extraction data from S3 automatically.
- For submission summaries, use submission_summary. It reads metadata + extraction from S3 automatically.
- For cross-sell analysis, use cross_sell_analysis. It identifies coverage gaps and upsell opportunities.
- For peer comparison, use peer_comparison. It benchmarks the submission against similar risks in the book.
- Be concise and show your work.
- Format currency values with $ and commas.
- For premium calculations: Premium = Coverage × Rate."""


def create_submissions_agent(callback_handler=None) -> Agent:
    """Return an Agent for the submissions workflow with calculator + extraction tools."""
    model = BedrockModel(
        model_id="amazon.nova-lite-v1:0",
        region_name="us-east-1",
    )
    kwargs = dict(
        model=model,
        tools=SUBMISSIONS_TOOLS,
        system_prompt=SUBMISSIONS_SYSTEM_PROMPT,
    )
    if callback_handler:
        kwargs["callback_handler"] = callback_handler
    return Agent(**kwargs)


# ── Planner (Pre-processing) ─────────────────────────────────────────────────

_pending_plans: dict[str, dict] = {}

PLANNER_PROMPT = """You are a STRICT task classifier. You MUST default to {"needs_plan": false} unless the request EXPLICITLY requires 2+ DIFFERENT tools used in sequence where the output of one tool feeds into the next.

CRITICAL RULES:
- A single question = NO plan. Always.
- Math expressions (even complex ones) = NO plan. The calculator handles multi-step math internally.
- Asking about uploaded documents = NO plan. doc_analysis handles this in one call.
- Asking about a Jira ticket = NO plan. One tool call.
- Asking for comments on a ticket = NO plan. One tool call.
- Summarizing comments = NO plan. One tool call (jira_summarize_comments does it all).
- General conversation, greetings, questions = NO plan.

ONLY return needs_plan=true when the user EXPLICITLY asks for a SEQUENCE that requires DIFFERENT tool categories (e.g., Jira + Calculator, or Jira + Doc Analysis, or fetching data AND then writing/posting something).

RESPOND IN STRICT JSON FORMAT ONLY. No other text.

If PLAN needed: {"needs_plan": true, "goal": "...", "steps": ["Step 1: ...", "Step 2: ..."]}
If NO plan needed: {"needs_plan": false}

NO PLAN examples (return {"needs_plan": false}):
- "what is 2+2" → NO plan
- "calculate (15+5) * 8" → NO plan (calculator handles it)
- "get ticket HIS-90" → NO plan
- "get comments on HIS-90" → NO plan
- "summarize comments on HIS-90" → NO plan
- "what is the hotel name in the document?" → NO plan
- "summarize the uploaded PDF" → NO plan
- "search for open bugs" → NO plan
- "what tools do you have?" → NO plan
- "hello" → NO plan

PLAN examples (return {"needs_plan": true}):
- "Get HIS-90 details, read its comments, and post a summary back as a new comment" → YES (read + write across tools)
- "Search for open bugs and add a status update comment to each" → YES (search + write for each)
- "Analyze the uploaded document and post findings as a comment on HIS-90" → YES (doc_analysis + jira_add_comment)"""


def classify_query(user_message: str) -> dict | None:
    """Use a quick Bedrock call to classify if the query needs a plan."""
    msg_lower = user_message.lower().strip()
    word_count = len(msg_lower.split())

    if word_count < 8:
        return None

    sequence_words = ["and then", "then ", "after that", "finally", "followed by",
                      "next ", "and also", "and post", "and add", "and write",
                      "and create", "and update", "and summarize"]
    has_sequence = any(w in msg_lower for w in sequence_words)

    if not has_sequence:
        return None

    try:
        response = settings.bedrock_runtime.converse(
            modelId=settings.LLM_MODEL_ID,
            system=[{"text": PLANNER_PROMPT}],
            messages=[{
                "role": "user",
                "content": [{"text": user_message}],
            }],
            inferenceConfig={"maxTokens": 300},
        )
        raw = response["output"]["message"]["content"][0]["text"].strip()
        import re
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            result = json.loads(json_match.group())
            if result.get("needs_plan"):
                return result
        return None
    except Exception as e:
        logger.error(f"Planner classification error: {e}")
        return None


# ── Agent Factory ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a multi-agent orchestrator. You MUST use tools to answer questions. NEVER say you don't have tools.

YOUR TOOLS:
1. **Calculator** (add, subtract, multiply, divide) — math operations
2. **Doc Analysis** (doc_analysis) — ALWAYS use this for ANY question about uploaded documents, PDFs, files, or attachments. If the user mentions "document", "uploaded", "PDF", "file", "attachment", or asks about content in a document, ALWAYS call doc_analysis.
3. **Jira** (READ-ONLY tools):
   - jira_get_ticket: Get ticket details
   - jira_get_comments: Read comments
   - jira_search_tickets: Search tickets
   - jira_summarize_comments: AI summary of comments
   - jira_add_comment: ONLY for internal use — NEVER call this directly for user requests to post/create/write comments
4. **Jira comment drafts** (draft_jira_comment_summary) — Drafts text for a Jira ticket comment (not email). Use for ANY request to create, write, post, add, or draft a summary or comment on a ticket. Pass everything the comment should cover in the single `context` argument — no To/Subject.

CRITICAL RULES:
- ALWAYS use a tool when relevant. NEVER say "I don't have the tools" — you DO have them.
- For ANY question about documents/PDFs/uploads → call doc_analysis immediately.
- For reading Jira tickets/comments → call jira_get_ticket, jira_get_comments, jira_search_tickets, jira_summarize_comments.
- For math → call calculator tools.
- **IMPORTANT: When the user asks to CREATE, WRITE, POST, ADD, or DRAFT a comment/summary/note on a Jira ticket → ALWAYS use draft_jira_comment_summary with a rich `context` string. NEVER use jira_add_comment directly.** The draft is shown for human approval before posting.
- Be concise in your responses."""


def create_agent(callback_handler=None, ticket_key=None) -> Agent:
    """Return a Strands ``Agent`` (Nova Lite + ``ALL_AGENT_TOOLS`` + ``SYSTEM_PROMPT``).

    If ``callback_handler`` is set, Strands will invoke it for streaming text and tool
    use (used by the WebSocket path). If ``ticket_key`` is set, the system prompt is
    extended so references like "this ticket" resolve to that key.
    """
    model = BedrockModel(
        model_id="amazon.nova-lite-v1:0",
        region_name="us-east-1",
    )
    prompt = SYSTEM_PROMPT
    if ticket_key:
        prompt += f"""

IMPORTANT CONTEXT: You are currently working on Jira ticket **{ticket_key}**.
When the user asks about "the ticket", "this ticket", "the subject", or any ticket-related question without specifying a key, always use **{ticket_key}** as the ticket key.
Always use the jira tools with ticket_key="{ticket_key}" unless the user explicitly mentions a different ticket."""

    kwargs = dict(
        model=model,
        tools=ALL_AGENT_TOOLS,
        system_prompt=prompt,
    )
    if callback_handler:
        kwargs["callback_handler"] = callback_handler
    return Agent(**kwargs)


# ── AgentCore App ─────────────────────────────────────────────────────────────

app = BedrockAgentCoreApp()

# Per-connection agent sessions & WebSocket references
_sessions: dict[str, Agent] = {}
_ws_connections: dict[str, object] = {}   # session_id -> websocket
_webhook_plans: dict[str, list] = {}      # ticket_key -> [pending webhook plans]


# ── Discovery Endpoint ────────────────────────────────────────────────────────

async def list_agents(request: Request):
    """Return available agents with their metadata for dynamic UI discovery."""
    # Check for workflow_type query param
    workflow_type = request.query_params.get("workflow_type", "jira")
    registry = SUBMISSIONS_AGENT_REGISTRY if workflow_type == "submissions" else AGENT_REGISTRY
    return JSONResponse(
        registry,
        headers={"Access-Control-Allow-Origin": "*"},
    )

# ── Webhook Endpoint ─────────────────────────────────────────────────────────

async def webhook_jira(request: Request):
    """
    POST /webhook/jira — Simulates a Jira webhook → API Gateway → Lambda flow.

    Accepts a Jira event payload, generates a plan using Bedrock, and pushes
    it to the active WebSocket session (or queues it for when user connects).

    Body: {
        "ticket_key": "HIS-90",
        "event_type": "ticket_updated",
        "session_id": "target-session-id" (optional),
        "summary": "optional override summary"
    }
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400,
                          headers={"Access-Control-Allow-Origin": "*"})

    ticket_key = body.get("ticket_key", "")
    event_type = body.get("event_type", "ticket_updated")
    target_session = body.get("session_id")
    custom_summary = body.get("summary")

    if not ticket_key:
        return JSONResponse({"error": "ticket_key is required"}, status_code=400,
                          headers={"Access-Control-Allow-Origin": "*"})

    logger.info(f"[WEBHOOK] Jira event: {event_type} on {ticket_key}")

    try:
        ticket_info = call_jira_api(f"/rest/api/2/issue/{ticket_key}")
        comments_data = call_jira_api(f"/rest/api/2/issue/{ticket_key}/comment")
        comments = comments_data.get("comments", [])

        ticket_summary = ticket_info.get("fields", {}).get("summary", "No summary")
        ticket_status = ticket_info.get("fields", {}).get("status", {}).get("name", "Unknown")
        ticket_type = ticket_info.get("fields", {}).get("issuetype", {}).get("name", "Task")

        comment_texts = []
        for c in comments[-10:]:
            author = c.get("author", {}).get("displayName", "Unknown")
            body_text = c.get("body", "")[:200]
            comment_texts.append(f"- {author}: {body_text}")

        ctx = f"Ticket: {ticket_key}\nType: {ticket_type}\nStatus: {ticket_status}\nSummary: {ticket_summary}"
        if comment_texts:
            ctx += f"\n\nRecent comments:\n" + "\n".join(comment_texts)

    except Exception as e:
        logger.error(f"[WEBHOOK] Jira fetch failed: {e}")
        ctx = f"Ticket: {ticket_key} (details unavailable: {str(e)[:100]})"

    if custom_summary:
        goal = custom_summary
        steps = [
            f"Fetch full details of {ticket_key}",
            f"Read all comments on {ticket_key}",
            f"Generate comprehensive summary with key decisions and action items",
            f"Post summary as comment on {ticket_key}",
        ]
    else:
        try:
            plan_prompt = f"""A Jira ticket was just updated. Based on the context below, create an action plan.

{ctx}

Return a JSON object with:
- "goal": a one-line summary of what needs to be done
- "steps": array of 3-5 specific action steps

Return ONLY valid JSON, no other text."""

            resp = settings.bedrock_runtime.converse(
                modelId="amazon.nova-lite-v1:0",
                messages=[{"role": "user", "content": [{"text": plan_prompt}]}],
                inferenceConfig={"maxTokens": 500, "temperature": 0.3},
            )

            import re
            raw = resp["output"]["message"]["content"][0]["text"]
            json_match = re.search(r'\{[\s\S]*\}', raw)
            if json_match:
                plan_data = json.loads(json_match.group())
                goal = plan_data.get("goal", f"Process update on {ticket_key}")
                steps = plan_data.get("steps", [f"Review {ticket_key}"])
            else:
                goal = f"Process update on {ticket_key}"
                steps = [f"Fetch details of {ticket_key}", f"Read comments on {ticket_key}", "Generate summary"]
        except Exception as e:
            logger.error(f"[WEBHOOK] Plan generation failed: {e}")
            goal = f"Review updated ticket {ticket_key}"
            steps = [
                f"Fetch full details of {ticket_key}",
                f"Read all comments on {ticket_key}",
                f"Generate summary with key decisions and action items",
            ]

    plan_id = crypto_id()
    plan = {
        "planId": plan_id,
        "goal": goal,
        "steps": steps,
        "original_query": f"Webhook: {event_type} on {ticket_key}",
        "source": "webhook",
        "ticket_key": ticket_key,
        "event_type": event_type,
    }

    pushed = False

    if target_session and target_session in _ws_connections:
        try:
            ws = _ws_connections[target_session]
            await ws.send_json({
                "type": "plan_proposal",
                "planId": plan_id,
                "goal": goal,
                "steps": steps,
                "source": "webhook",
                "ticketKey": ticket_key,
            })
            _pending_plans[target_session] = plan
            pushed = True
            logger.info(f"[WEBHOOK] Plan pushed to session {target_session}")
        except Exception as e:
            logger.error(f"[WEBHOOK] Push to session failed: {e}")

    if not pushed:
        for sid, ws in list(_ws_connections.items()):
            try:
                await ws.send_json({
                    "type": "plan_proposal",
                    "planId": plan_id,
                    "goal": goal,
                    "steps": steps,
                    "source": "webhook",
                    "ticketKey": ticket_key,
                })
                _pending_plans[sid] = plan
                pushed = True
                logger.info(f"[WEBHOOK] Plan pushed to active session {sid}")
                break
            except Exception:
                continue

    if not pushed:
        queue_key = target_session or "__global__"
        if queue_key not in _webhook_plans:
            _webhook_plans[queue_key] = []
        _webhook_plans[queue_key].append(plan)
        logger.info(f"[WEBHOOK] Plan queued (no active session). Queue key: {queue_key}")

    return JSONResponse({
        "status": "ok",
        "planId": plan_id,
        "pushed": pushed,
        "queued": not pushed,
        "goal": goal,
        "steps": steps,
    }, headers={"Access-Control-Allow-Origin": "*"})


async def webhook_options(request: Request):
    """CORS preflight for webhook endpoint."""
    return JSONResponse("", headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    })


app.routes.insert(0, Route("/agents", list_agents, methods=["GET"]))
app.routes.insert(1, Route("/webhook/jira", webhook_jira, methods=["POST"]))
app.routes.insert(2, Route("/webhook/jira", webhook_options, methods=["OPTIONS"]))


def _append_chat_history(ticket_key: str, session_id: str, msg: dict):
    """Append a message to the S3 chat history for a ticket session."""
    if not ticket_key or not session_id:
        return
    import settings as _settings
    key = f"chat-history/{ticket_key}/{session_id}.json"
    try:
        existing = []
        try:
            resp = _settings.s3_client.get_object(Bucket=_settings.S3_BUCKET, Key=key)
            existing = json.loads(resp["Body"].read().decode())
        except Exception:
            pass
        existing.append(msg)
        # Keep last 100 messages
        if len(existing) > 100:
            existing = existing[-100:]
        _settings.s3_client.put_object(
            Bucket=_settings.S3_BUCKET,
            Key=key,
            Body=json.dumps(existing, default=str),
            ContentType="application/json",
        )
    except Exception as e:
        logger.warning(f"Failed to save chat history for {ticket_key}/{session_id}: {e}")


# ── Session tracking ──────────────────────────────────────────────────────────

_session_msg_count: dict[str, int] = {}


def _save_session_index(session_id: str, ticket_key: str, message_count: int = 0, summary: str = ""):
    """Save/update session index record in S3."""
    if not ticket_key:
        return
    import settings as _settings
    key = f"sessions/{ticket_key}/{session_id}.json"
    now = datetime.now(timezone.utc).isoformat()

    # Try to load existing
    record = {
        "session_id": session_id,
        "ticket_key": ticket_key,
        "created_at": now,
        "last_active": now,
        "message_count": message_count,
        "summary": summary,
    }
    try:
        resp = _settings.s3_client.get_object(Bucket=_settings.S3_BUCKET, Key=key)
        existing = json.loads(resp["Body"].read().decode())
        record["created_at"] = existing.get("created_at", now)
        record["message_count"] = message_count or existing.get("message_count", 0)
        record["summary"] = summary or existing.get("summary", "")
    except Exception:
        pass

    record["last_active"] = now
    _settings.s3_client.put_object(
        Bucket=_settings.S3_BUCKET,
        Key=key,
        Body=json.dumps(record, default=str),
        ContentType="application/json",
    )


def _run_agent_with_context(agent_instance, prompt, ticket_key, session_id=""):
    """Run agent with ticket_key + session_id set in both global and thread-local context."""
    from context import set_active_context
    set_active_context(ticket_key=ticket_key, session_id=session_id)
    _thread_ctx.ticket_key = ticket_key
    _thread_ctx.session_id = session_id
    logger.info(f"[AgentRun] ticket_key={ticket_key} | prompt={prompt[:80]}...")
    result = agent_instance(prompt)
    return result


# ── WebSocket Handler ─────────────────────────────────────────────────────────

@app.websocket
async def websocket_handler(websocket, context):
    """Drive the interactive session: messages in, agent/tool events out.

    Accepts the connection, registers session state (agent instance, ticket context,
    upload list), then loops on JSON text frames. Dispatches by ``type`` (e.g. chat,
    ticket linking, document upload, plan approval, extraction actions). Strands
    output is not awaited directly; ``callback_handler`` enqueues structured events
    (``agent_response``, ``tool_call``) for the loop to flush to the client where
    appropriate (e.g. during plan steps).
    """
    await websocket.accept()

    session_id = getattr(context, "session_id", None) or str(id(websocket))
    logger.info(f"WS connected: session={session_id}")

    ws_queue: asyncio.Queue = asyncio.Queue()
    _seen_tool_calls: set = set()

    def callback_handler(**kwargs):
        """Strands streaming callback: normalize model text and emit tool_use events.

        Forwards cleaned assistant text to ``ws_queue`` as ``agent_response`` and
        deduplicates ``current_tool_use`` notifications as ``tool_call`` messages.
        """
        import re as _re
        if "data" in kwargs:
            data = kwargs["data"]
            if isinstance(data, str) and data:
                clean = _re.sub(r'</?(?:result|response|thinking|toolResult|toolUse|tool|function_calls|invoke|parameter|antml:)[^>]*>', '', data)
                if clean.strip():
                    ws_queue.put_nowait({"type": "agent_response", "content": clean, "done": False})

        if "current_tool_use" in kwargs:
            tool_use = kwargs["current_tool_use"]
            tool_name = tool_use.get("name", "")
            tool_id = tool_use.get("toolUseId", "")
            if tool_name and tool_id and tool_id not in _seen_tool_calls:
                _seen_tool_calls.add(tool_id)
                ws_queue.put_nowait({
                    "type": "tool_call",
                    "tool": tool_name,
                    "input": tool_use.get("input", {}),
                    "toolUseId": tool_id,
                })

    agent = create_agent(callback_handler=callback_handler)
    _sessions[session_id] = agent
    _ws_connections[session_id] = websocket
    state._session_context[session_id] = {"ticket_key": None, "uploaded_docs": []}

    await websocket.send_json({
        "type": "system",
        "content": "Connected to AgentCore. Multi-Agent Orchestrator ready.",
    })

    # Server-side keepalive: send heartbeat every 20s to prevent
    # CloudFront/ALB from closing idle WebSocket connections.
    async def _keepalive():
        try:
            while True:
                await asyncio.sleep(20)
                await websocket.send_json({"type": "pong"})
        except Exception:
            pass

    keepalive_task = asyncio.create_task(_keepalive())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "register_session":
                # Frontend sends its session ID — adopt it for S3 storage
                client_sid = msg.get("sessionId", "")
                if client_sid and client_sid != session_id:
                    old_sid = session_id
                    # Migrate references from old session_id to client's
                    if old_sid in _sessions:
                        _sessions[client_sid] = _sessions.pop(old_sid)
                    if old_sid in _ws_connections:
                        _ws_connections[client_sid] = _ws_connections.pop(old_sid)
                    if old_sid in state._session_context:
                        state._session_context[client_sid] = state._session_context.pop(old_sid)
                    if old_sid in _session_msg_count:
                        _session_msg_count[client_sid] = _session_msg_count.pop(old_sid)
                    session_id = client_sid
                    logger.info(f"[{session_id}] Adopted client session ID (was {old_sid})")
                continue

            elif msg_type == "set_ticket_context":
                ticket_key = msg.get("ticketKey", "")
                if ticket_key:
                    state._session_context[session_id]["ticket_key"] = ticket_key
                    logger.info(f"[{session_id}] Ticket context set: {ticket_key}")

                    agent = create_agent(callback_handler=callback_handler, ticket_key=ticket_key)
                    _sessions[session_id] = agent

                    # Retrieve long-term memory from AgentCore MemoryClient
                    try:
                        memories = settings.memory_client.retrieve_memories(
                            memory_id=settings.MEMORY_ID,
                            namespace=f"/strategies/ticket_facts/actors/{ticket_key}/",
                            query=f"Key facts and context about ticket {ticket_key}",
                            top_k=5,
                        )
                        if memories:
                            memory_context = "\n".join(
                                m.get("content", {}).get("text", str(m)) for m in memories
                            )
                            agent.messages.append({
                                "role": "user",
                                "content": [{"text": f"[SYSTEM MEMORY] Previous context for {ticket_key}:\n{memory_context}"}],
                            })
                            agent.messages.append({
                                "role": "assistant",
                                "content": [{"text": f"I have context from previous conversations about {ticket_key}. How can I help?"}],
                            })
                            logger.info(f"[{session_id}] Retrieved {len(memories)} memories for {ticket_key}")
                    except Exception as e:
                        logger.warning(f"[{session_id}] Could not retrieve memories: {e}")

                    queued = _webhook_plans.pop(ticket_key, []) + _webhook_plans.pop("__global__", [])
                    for plan in queued:
                        _pending_plans[session_id] = plan
                        await websocket.send_json({
                            "type": "plan_proposal",
                            "planId": plan["planId"],
                            "goal": plan["goal"],
                            "steps": plan["steps"],
                            "source": "webhook",
                            "ticketKey": plan.get("ticket_key", ""),
                        })
                        logger.info(f"[{session_id}] Delivered queued webhook plan for {ticket_key}")

                    try:
                        pending_emails = list_pending_drafts(ticket_key)
                        for draft_state in pending_emails:
                            await websocket.send_json(_jira_draft_ws_payload(draft_state))
                            logger.info(f"[{session_id}] Delivered pending Jira draft: {draft_state['draft_id']}")
                    except Exception as e:
                        logger.warning(f"[{session_id}] Failed to load pending reconciliation drafts: {e}")

                    # Initialize message count — session index saved on first message
                    _session_msg_count[session_id] = 0

                    await websocket.send_json({
                        "type": "system",
                        "content": f"Session linked to ticket {ticket_key}.",
                    })
                continue

            elif msg_type == "set_workflow_type":
                workflow_type = msg.get("workflowType", "jira")
                sub_id = msg.get("submissionId", "")
                state._session_context[session_id]["workflow_type"] = workflow_type
                if sub_id:
                    state._session_context[session_id]["ticket_key"] = sub_id
                if workflow_type == "submissions":
                    agent = create_submissions_agent(callback_handler=callback_handler)
                    _sessions[session_id] = agent
                    logger.info(f"[{session_id}] Switched to submissions workflow, submission={sub_id}")
                continue

            elif msg_type == "upload_doc":
                s3_key = msg.get("s3Key", "")
                bucket = msg.get("bucket", settings.S3_BUCKET)
                file_name = msg.get("fileName", "document.pdf")
                ctx = state._session_context.get(session_id, {})
                # Use submissionId as namespace for submissions workflow, ticket_key for Jira
                tk = msg.get("submissionId") or msg.get("ticketKey") or ctx.get("ticket_key") or "general"
                if s3_key:
                    ctx.setdefault("uploaded_docs", []).append(s3_key)
                    # Extract attachment ID from s3 key: emails/<guid>/<att-guid>/file.pdf
                    att_id = ""
                    parts = s3_key.split("/")
                    if len(parts) >= 3:
                        att_id = parts[-2]  # sub_guid of the attachment
                    logger.info(f"[{session_id}] Ingesting for ticket={tk}, att={att_id}: s3://{bucket}/{s3_key}")
                    await websocket.send_json({
                        "type": "system",
                        "content": f"Processing '{file_name}'... extracting text and creating embeddings.",
                    })

                    try:
                        loop = asyncio.get_event_loop()
                        chunk_count = await loop.run_in_executor(
                            None, ingest_pdf_from_s3, bucket, s3_key, tk, att_id
                        )
                        # Track attachment index for querying later
                        if att_id:
                            from tools.doc_analysis import _get_index_name
                            idx_name = _get_index_name(tk, att_id)
                            ctx.setdefault("attachment_indexes", []).append(idx_name)
                        await websocket.send_json({
                            "type": "system",
                            "content": f"Document '{file_name}' ready! Ingested {chunk_count} chunks into S3 Vectors. You can now ask questions about it.",
                        })
                    except Exception as e:
                        logger.error(f"[{session_id}] Ingestion failed: {e}")
                        await websocket.send_json({
                            "type": "error",
                            "content": f"Failed to process document: {str(e)}",
                        })
                continue

            elif msg_type == "plan_approve":
                plan_id = msg.get("planId", "")
                logger.info(f"[{session_id}] Plan approved: {plan_id}")
                plan = _pending_plans.pop(session_id, None)
                if plan:
                    steps = plan.get("steps", [])
                    await websocket.send_json({
                        "type": "plan_status",
                        "status": "executing",
                        "planId": plan_id,
                    })

                    plan_tk = state._session_context.get(session_id, {}).get("ticket_key")
                    create_agent(callback_handler=callback_handler, ticket_key=plan_tk)

                    step_results = []
                    all_succeeded = True

                    for step_idx, step_text in enumerate(steps):
                        _seen_tool_calls.clear()
                        while not ws_queue.empty():
                            ws_queue.get_nowait()

                        await websocket.send_json({
                            "type": "plan_step_update",
                            "planId": plan_id,
                            "stepIndex": step_idx,
                            "status": "executing",
                        })

                        try:
                            loop = asyncio.get_event_loop()

                            step_agent = create_agent(callback_handler=callback_handler, ticket_key=plan_tk)

                            async def drain_step_queue():
                                while True:
                                    try:
                                        event = await asyncio.wait_for(ws_queue.get(), timeout=0.1)
                                        await websocket.send_json(event)
                                    except asyncio.TimeoutError:
                                        continue
                                    except Exception:
                                        break

                            drain_task = asyncio.create_task(drain_step_queue())

                            prev_ctx = ""
                            if step_results:
                                prev_ctx = "Context from previous steps:\n" + "\n".join(
                                    f"- Step {i+1} result: {r[:300]}" for i, r in enumerate(step_results)
                                ) + "\n\n"

                            step_prompt = f"{prev_ctx}Execute ONLY this step: {step_text}\n\nUse the appropriate tool. Be concise — just report the result."
                            tk = state._session_context.get(session_id, {}).get("ticket_key")
                            result = await loop.run_in_executor(
                                None, _run_agent_with_context, step_agent, step_prompt, tk, session_id
                            )

                            await asyncio.sleep(0.5)
                            drain_task.cancel()
                            while not ws_queue.empty():
                                event = ws_queue.get_nowait()
                                await websocket.send_json(event)

                            import re
                            result_text = str(result) if result else ""
                            result_text = re.sub(r'</?(?:result|response|thinking|toolResult|toolUse|tool|function_calls|invoke|parameter|antml:)[^>]*>', '', result_text).strip()
                            step_results.append(result_text)

                            if result_text:
                                await websocket.send_json({
                                    "type": "agent_done",
                                    "content": result_text,
                                })

                            await websocket.send_json({
                                "type": "plan_step_update",
                                "planId": plan_id,
                                "stepIndex": step_idx,
                                "status": "completed",
                            })

                            logger.info(f"[{session_id}] Step {step_idx+1}/{len(steps)} completed")

                        except Exception as e:
                            logger.error(f"[{session_id}] Step {step_idx+1} failed: {e}")
                            await websocket.send_json({
                                "type": "plan_step_update",
                                "planId": plan_id,
                                "stepIndex": step_idx,
                                "status": "failed",
                            })
                            await websocket.send_json({
                                "type": "error",
                                "content": f"Step {step_idx+1} failed: {str(e)}",
                            })
                            all_succeeded = False
                            break

                    await websocket.send_json({
                        "type": "plan_status",
                        "status": "completed" if all_succeeded else "failed",
                        "planId": plan_id,
                    })
                continue

            elif msg_type == "plan_reject":
                plan_id = msg.get("planId", "")
                logger.info(f"[{session_id}] Plan rejected: {plan_id}")
                _pending_plans.pop(session_id, None)
                await websocket.send_json({
                    "type": "plan_status",
                    "status": "rejected",
                    "planId": plan_id,
                })
                await websocket.send_json({
                    "type": "agent_done",
                    "content": "Plan was rejected. Let me know how you'd like to proceed.",
                })
                continue

            elif msg_type == "email_approve":
                draft_id = msg.get("draftId", "")
                logger.info(f"[{session_id}] Draft approved: {draft_id}")
                try:
                    # Try email draft first, then Jira comment draft
                    from email_draft import approve_draft as email_approve, mark_sent as email_mark_sent, send_email_ses, load_draft_state as email_load
                    from jira_comment_draft import approve_draft as jira_approve, mark_sent as jira_mark_sent

                    email_state = email_load(draft_id)
                    if email_state and email_state.get("to"):
                        # This is an email draft — send via SES
                        approved = email_approve(draft_id)
                        if approved:
                            to_addr = approved["to"]
                            subject = approved.get("subject", "No Subject")
                            body = approved["draft"]
                            sent = send_email_ses(to_addr, subject, body)
                            if sent:
                                email_mark_sent(draft_id)
                                await websocket.send_json({
                                    "type": "email_sent",
                                    "draftId": draft_id,
                                    "status": "sent",
                                })
                                await websocket.send_json({
                                    "type": "agent_done",
                                    "content": f"Email sent to {to_addr}.",
                                })
                            else:
                                await websocket.send_json({
                                    "type": "error",
                                    "content": f"Failed to send email to {to_addr}. Check SES configuration.",
                                })
                        else:
                            await websocket.send_json({
                                "type": "error",
                                "content": f"Email draft {draft_id} not found.",
                            })
                    else:
                        # Jira comment draft
                        approved = jira_approve(draft_id)
                        if approved:
                            ticket_key = approved.get("ticket_key") or state._session_context.get(session_id, {}).get("ticket_key", "")
                            if ticket_key:
                                try:
                                    post_jira_comment_v3(ticket_key, approved["draft"])
                                    logger.info(f"[{session_id}] Posted Jira comment draft on {ticket_key}")
                                except Exception as je:
                                    logger.error(f"[{session_id}] Jira comment failed: {je}")

                            jira_mark_sent(draft_id)
                            await websocket.send_json({
                                "type": "email_sent",
                                "draftId": draft_id,
                                "status": "sent",
                            })
                            post_target = f"Jira ticket {ticket_key}" if ticket_key else "the ticket"
                            await websocket.send_json({
                                "type": "agent_done",
                                "content": f"Comment posted on {post_target}.",
                            })
                        else:
                            await websocket.send_json({
                                "type": "error",
                                "content": f"Draft {draft_id} not found.",
                            })
                except Exception as e:
                    logger.error(f"[{session_id}] Draft approve error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Failed to process draft: {str(e)}",
                    })
                continue

            elif msg_type == "email_revise":
                draft_id = msg.get("draftId", "")
                feedback = msg.get("feedback", "")
                logger.info(f"[{session_id}] Draft revision requested: {draft_id}")
                try:
                    from email_draft import revise_draft as _email_revise, load_draft_state as _email_load
                    from jira_comment_draft import revise_draft as _jira_revise

                    # Check if it's an email draft or Jira draft
                    email_state = _email_load(draft_id)
                    if email_state and "to" in email_state:
                        loop = asyncio.get_event_loop()
                        revised = await loop.run_in_executor(
                            None, _email_revise, draft_id, feedback
                        )
                    else:
                        loop = asyncio.get_event_loop()
                        revised = await loop.run_in_executor(
                            None, _jira_revise, draft_id, feedback
                        )

                    if revised:
                        await websocket.send_json(_jira_draft_ws_payload(revised))
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "content": f"Draft {draft_id} not found.",
                        })
                except Exception as e:
                    logger.error(f"[{session_id}] Draft revise error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Failed to revise draft: {str(e)}",
                    })
                continue

            elif msg_type == "user_message":
                content = msg.get("content", "").strip()
                if not content:
                    continue

                tk = state._session_context.get(session_id, {}).get("ticket_key") or ""
                logger.info(f"[{session_id}] User: {content[:80]}")
                _seen_tool_calls.clear()

                # Save user message to chat history
                _append_chat_history(tk, session_id, {
                    "type": "user",
                    "content": content,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                # Update session index
                _session_msg_count[session_id] = _session_msg_count.get(session_id, 0) + 1
                _save_session_index(session_id, tk, message_count=_session_msg_count[session_id])

                try:
                    loop = asyncio.get_event_loop()

                    plan_data = await loop.run_in_executor(None, classify_query, content)

                    if plan_data:
                        plan_id = crypto_id()
                        plan_data["original_query"] = content
                        _pending_plans[session_id] = plan_data

                        logger.info(f"[{session_id}] Plan generated: {plan_data['goal']}")
                        await websocket.send_json({
                            "type": "plan_proposal",
                            "planId": plan_id,
                            "goal": plan_data.get("goal", ""),
                            "steps": plan_data.get("steps", []),
                        })
                        continue

                    _intermediate_events: list[dict] = []

                    async def drain_queue():
                        while True:
                            try:
                                event = await asyncio.wait_for(ws_queue.get(), timeout=0.1)
                                await websocket.send_json(event)
                                # Collect tool_call events for chat history
                                if event.get("type") == "tool_call":
                                    _intermediate_events.append(event)
                            except asyncio.TimeoutError:
                                continue
                            except Exception:
                                break

                    drain_task = asyncio.create_task(drain_queue())
                    tk = state._session_context.get(session_id, {}).get("ticket_key")
                    logger.info(f"[{session_id}] Calling agent with tk={tk}, session_id={session_id}")
                    result = await loop.run_in_executor(None, _run_agent_with_context, agent, content, tk, session_id)

                    await asyncio.sleep(0.3)
                    drain_task.cancel()

                    while not ws_queue.empty():
                        event = ws_queue.get_nowait()
                        await websocket.send_json(event)
                        if event.get("type") == "tool_call":
                            _intermediate_events.append(event)

                    # Save tool calls to chat history
                    for evt in _intermediate_events:
                        _append_chat_history(tk or "", session_id, {
                            "type": "tool_call",
                            "tool": evt.get("tool", ""),
                            "input": evt.get("input", {}),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    import re
                    final_text = str(result) if result else ""
                    final_text = re.sub(r'</?(?:result|response|thinking|toolResult|toolUse|tool|function_calls|invoke|parameter|antml:)[^>]*>', '', final_text).strip()
                    if final_text:
                        await websocket.send_json({
                            "type": "agent_done",
                            "content": final_text,
                        })
                        # Save agent response to chat history
                        _append_chat_history(tk or "", session_id, {
                            "type": "agent",
                            "content": final_text,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                        # Update session index
                        _session_msg_count[session_id] = _session_msg_count.get(session_id, 0) + 1
                        _save_session_index(session_id, tk or "", message_count=_session_msg_count[session_id])

                    pending_draft = state._pending_drafts_queue.pop("__latest__", None)
                    logger.info(f"[{session_id}] Post-run draft check: {'FOUND' if pending_draft else 'NONE'}")
                    if pending_draft and isinstance(pending_draft, dict):
                        draft_payload = _jira_draft_ws_payload(pending_draft)
                        await websocket.send_json(draft_payload)
                        # Save draft to chat history so it persists across reloads
                        _append_chat_history(tk or "", session_id, {
                            **draft_payload,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

                    # Check for pending extraction results
                    pending_extraction = state._pending_extractions_queue.pop("__latest__", None)
                    if pending_extraction and isinstance(pending_extraction, dict):
                        eid = pending_extraction.get("extraction_id", "")
                        field_count = len(pending_extraction.get("extracted_data", []))
                        logger.info(f"[{session_id}] Post-run extraction: {eid} ({field_count} fields)")
                        await websocket.send_json({
                            "type": "data_extraction",
                            "extractionId": eid,
                            "ticketKey": pending_extraction.get("ticket_key", ""),
                            "fieldCount": field_count,
                            "status": pending_extraction.get("status", "pending_review"),
                            "s3Uri": pending_extraction.get("s3_uri", ""),
                        })

                except Exception as e:
                    logger.error(f"[{session_id}] Agent error: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Agent error: {str(e)}",
                    })
            else:
                logger.warning(f"[{session_id}] Ignoring unknown message type: {msg_type}")

    except Exception as e:
        logger.info(f"WS disconnected: session={session_id} ({e})")
    finally:
        keepalive_task.cancel()
        ctx = state._session_context.get(session_id, {})
        ticket_key = ctx.get("ticket_key")
        agent = _sessions.get(session_id)

        # Save session summary (first user message) on disconnect
        if ticket_key:
            try:
                summary = ""
                if agent and hasattr(agent, "messages"):
                    for m in agent.messages:
                        if m.get("role") == "user":
                            content = m.get("content", [])
                            if isinstance(content, list):
                                text = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
                            else:
                                text = str(content)
                            text = text.strip()
                            if text and not text.startswith("[SYSTEM"):
                                summary = text[:120]
                                break
                _save_session_index(
                    session_id, ticket_key,
                    message_count=_session_msg_count.get(session_id, 0),
                    summary=summary,
                )
            except Exception as e:
                logger.warning(f"[{session_id}] Failed to save session summary: {e}")
            _session_msg_count.pop(session_id, None)

        if ticket_key and agent:
            try:
                # Save conversation to AgentCore long-term memory
                msgs = list(agent.messages) if hasattr(agent, 'messages') else []
                if msgs:
                    # Convert to (text, role) tuples for MemoryClient
                    conversation = []
                    for m in msgs:
                        role = m.get("role", "user").upper()
                        content = m.get("content", [])
                        if isinstance(content, list):
                            text = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
                        else:
                            text = str(content)
                        if text.strip():
                            conversation.append((text.strip()[:2000], role))
                    if conversation:
                        settings.memory_client.save_conversation(
                            memory_id=settings.MEMORY_ID,
                            actor_id=ticket_key,
                            session_id=session_id,
                            messages=conversation,
                        )
                        logger.info(f"[{session_id}] Saved {len(conversation)} messages to AgentCore Memory for {ticket_key}")
            except Exception as e:
                logger.warning(f"[{session_id}] Could not save to AgentCore Memory: {e}")

        _sessions.pop(session_id, None)
        _ws_connections.pop(session_id, None)
        state._session_context.pop(session_id, None)
        _pending_plans.pop(session_id, None)
        logger.info(f"Session cleaned up: {session_id}")


if __name__ == "__main__":
    import subprocess
    import signal

    try:
        result = subprocess.run(
            ["lsof", "-ti", ":8080"], capture_output=True, text=True
        )
        pids = result.stdout.strip().split("\n")
        for pid in pids:
            if pid:
                os.kill(int(pid), signal.SIGKILL)
                logger.info(f"Killed existing process on port 8080 (PID {pid})")
    except Exception:
        pass

    app.run(host="0.0.0.0", log_level="info")
