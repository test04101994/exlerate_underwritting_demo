"""
Email draft workflow (LangGraph + S3 persistence).
Drafts an email for human review — approve to send via SES, or revise with feedback.
"""

import json
import logging
import uuid
from typing import TypedDict

from botocore.exceptions import ClientError
from langgraph.graph import END, START, StateGraph

import settings as _settings

logger = logging.getLogger("agentcore.email_draft")

AWS_REGION = _settings.AWS_REGION
LLM_MODEL_ID = _settings.LLM_MODEL_ID
S3_BUCKET = _settings.S3_BUCKET
DRAFTS_PREFIX = "email-drafts"

bedrock_runtime = _settings.bedrock_runtime
s3_client = _settings.s3_client


# ── State ────────────────────────────────────────────────────────────────────


class EmailDraftState(TypedDict):
    context: str            # what the email should cover
    to: str                 # recipient email address
    subject: str            # email subject line
    tone: str               # formal, casual, urgent
    label: str              # short UI label
    draft: str              # the email body
    feedback: str           # reviewer feedback for revisions
    status: str             # drafting → reviewing → approved → sent
    revision_count: int
    draft_id: str
    submission_id: str      # linked submission


# ── S3 Persistence ───────────────────────────────────────────────────────────


def save_draft_state(state: dict) -> None:
    draft_id = state["draft_id"]
    key = f"{DRAFTS_PREFIX}/{draft_id}.json"
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(state, default=str),
        ContentType="application/json",
    )
    logger.info(f"Saved email draft: s3://{S3_BUCKET}/{key}")


def load_draft_state(draft_id: str) -> dict | None:
    key = f"{DRAFTS_PREFIX}/{draft_id}.json"
    try:
        resp = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(resp["Body"].read().decode())
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "NoSuchKey":
            return None
        logger.error(f"Failed to load email draft {draft_id}: {e}")
        return None


# ── Bedrock LLM ──────────────────────────────────────────────────────────────


def _call_bedrock(system_prompt: str, user_prompt: str) -> str:
    resp = bedrock_runtime.converse(
        modelId=LLM_MODEL_ID,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        inferenceConfig={"maxTokens": 1500, "temperature": 0.4},
    )
    return resp["output"]["message"]["content"][0]["text"].strip()


def _make_label(context: str, max_len: int = 72) -> str:
    one = " ".join(context.split())[:max_len]
    return one + ("…" if len(context) > max_len else "")


# ── LangGraph Nodes ──────────────────────────────────────────────────────────


def generate_draft_node(state: EmailDraftState) -> dict:
    system = """You are drafting a professional email for an insurance underwriting workflow.
Write a clear, well-structured email with proper greeting and sign-off.
Include the subject line context naturally in the body.
Output ONLY the email body text (do NOT include To: or Subject: headers)."""

    user_prompt = f"""Email context / what this email should cover:
{state['context']}

Recipient: {state['to']}
Subject: {state['subject']}
Tone: {state['tone']}

Write the email body now."""

    draft = _call_bedrock(system, user_prompt)
    return {"draft": draft, "status": "reviewing"}


def apply_feedback_node(state: EmailDraftState) -> dict:
    system = """You revise professional emails based on reviewer feedback.
Return ONLY the revised email body — no preamble, no headers."""

    user_prompt = f"""Current draft email:
{state['draft']}

Reviewer feedback:
{state['feedback']}

Original context:
{state['context']}
Recipient: {state['to']}
Subject: {state['subject']}
Tone: {state['tone']}

Write the revised email body now."""

    revised = _call_bedrock(system, user_prompt)
    return {
        "draft": revised,
        "feedback": "",
        "status": "reviewing",
        "revision_count": state["revision_count"] + 1,
    }


# ── Compiled Graphs ──────────────────────────────────────────────────────────


def _build_generate_graph():
    graph = StateGraph(EmailDraftState)
    graph.add_node("generate_draft", generate_draft_node)
    graph.add_edge(START, "generate_draft")
    graph.add_edge("generate_draft", END)
    return graph.compile()


def _build_revise_graph():
    graph = StateGraph(EmailDraftState)
    graph.add_node("apply_feedback", apply_feedback_node)
    graph.add_edge(START, "apply_feedback")
    graph.add_edge("apply_feedback", END)
    return graph.compile()


_generate_graph = _build_generate_graph()
_revise_graph = _build_revise_graph()


# ── Public API ───────────────────────────────────────────────────────────────


def generate_initial_draft(
    context: str,
    to: str = "",
    subject: str = "",
    tone: str = "formal",
    submission_id: str = "",
) -> dict:
    """Generate an email draft and persist to S3."""
    draft_id = uuid.uuid4().hex[:8]
    label = _make_label(subject or context)

    initial_state: EmailDraftState = {
        "context": context,
        "to": to,
        "subject": subject,
        "tone": tone,
        "label": label,
        "draft": "",
        "feedback": "",
        "status": "drafting",
        "revision_count": 0,
        "draft_id": draft_id,
        "submission_id": submission_id,
    }

    logger.info(f"Generating email draft: {draft_id} (to={to}, sub={submission_id or '—'})")
    result = _generate_graph.invoke(initial_state)
    save_draft_state(result)
    logger.info(f"Email draft {draft_id} generated ({len(result['draft'])} chars)")
    return result


def revise_draft(draft_id: str, feedback: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["feedback"] = feedback
    logger.info(f"Revising email draft {draft_id} (revision #{state['revision_count'] + 1})")
    result = _revise_graph.invoke(state)
    save_draft_state(result)
    return result


def approve_draft(draft_id: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["status"] = "approved"
    save_draft_state(state)
    logger.info(f"Email draft {draft_id} approved")
    return state


def mark_sent(draft_id: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["status"] = "sent"
    save_draft_state(state)
    logger.info(f"Email draft {draft_id} marked sent")
    return state


# ── SES Sending ──────────────────────────────────────────────────────────────


def send_email_ses(to: str, subject: str, body: str, from_addr: str = "") -> bool:
    """Send an email via AWS SES."""
    ses = _settings.s3_client  # reuse region; create SES client below
    ses_client = __import__("boto3").client("ses", region_name=AWS_REGION)

    source = from_addr or f"noreply@underwriting-app.com"

    try:
        ses_client.send_email(
            Source=source,
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": body, "Charset": "UTF-8"},
                },
            },
        )
        logger.info(f"Email sent to {to}: {subject}")
        return True
    except Exception as e:
        logger.error(f"SES send failed: {e}")
        return False
