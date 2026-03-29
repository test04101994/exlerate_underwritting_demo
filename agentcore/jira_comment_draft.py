"""
Jira comment draft workflow (LangGraph + S3 persistence).
Drafts are reconciliation/summary text for posting as a Jira comment — not email.
"""

import json
import logging
import uuid
import boto3
from botocore.exceptions import ClientError
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

logger = logging.getLogger("agentcore.jira_draft")

import settings as _settings

AWS_REGION = _settings.AWS_REGION
LLM_MODEL_ID = _settings.LLM_MODEL_ID
S3_BUCKET = _settings.S3_BUCKET
DRAFTS_PREFIX = "jira-comment-drafts"

bedrock_runtime = _settings.bedrock_runtime
s3_client = _settings.s3_client


class JiraDraftState(TypedDict):
    """State for a draft Jira comment (stored in S3)."""
    context: str          # what the comment should cover
    tone: str
    label: str            # short UI line (truncated context), not an email subject
    draft: str
    feedback: str
    status: str
    revision_count: int
    draft_id: str
    ticket_key: str


def save_draft_state(state: dict) -> None:
    draft_id = state["draft_id"]
    key = f"{DRAFTS_PREFIX}/{draft_id}.json"
    s3_client.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=json.dumps(state, default=str),
        ContentType="application/json",
    )
    logger.info(f"Saved Jira draft state: s3://{S3_BUCKET}/{key}")


def load_draft_state(draft_id: str) -> dict | None:
    key = f"{DRAFTS_PREFIX}/{draft_id}.json"
    try:
        resp = s3_client.get_object(Bucket=S3_BUCKET, Key=key)
        return json.loads(resp["Body"].read().decode())
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "NoSuchKey":
            logger.error(f"Draft not found: {draft_id}")
            return None
        logger.error(f"Failed to load draft {draft_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Failed to load draft {draft_id}: {e}")
        return None


def list_pending_drafts(ticket_key: str = "") -> list[dict]:
    pending = []
    try:
        resp = s3_client.list_objects_v2(
            Bucket=S3_BUCKET,
            Prefix=f"{DRAFTS_PREFIX}/",
        )
        for obj in resp.get("Contents", []):
            try:
                data = s3_client.get_object(Bucket=S3_BUCKET, Key=obj["Key"])
                state = json.loads(data["Body"].read().decode())
                if state.get("status") == "reviewing":
                    if not ticket_key or state.get("ticket_key") == ticket_key:
                        pending.append(state)
            except Exception:
                continue
    except Exception as e:
        logger.error(f"Failed to list pending drafts: {e}")
    return pending


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


def generate_draft_node(state: JiraDraftState) -> dict:
    system = """You are drafting text for a Jira ticket comment (not an email).
Write a clear reconciliation or summary comment: professional, structured with bullets or short paragraphs as appropriate.
Do NOT use email conventions: no "To:", "Subject:", "Dear ...", "Best regards", or signature blocks.
Do NOT invent a recipient or salutation. Output ONLY the comment body text that can be pasted into Jira."""

    user_prompt = f"""Ticket context / what this comment should cover:
{state['context']}

Tone: {state['tone']}

Write the Jira comment body now."""

    draft = _call_bedrock(system, user_prompt)
    return {"draft": draft, "status": "reviewing"}


def apply_feedback_node(state: JiraDraftState) -> dict:
    system = """You revise Jira ticket comments based on reviewer feedback.
Return ONLY the revised comment body — no preamble, no "Subject:", no email formatting."""

    user_prompt = f"""Current draft comment:
{state['draft']}

Reviewer feedback:
{state['feedback']}

Original request context:
{state['context']}
Tone: {state['tone']}

Write the revised Jira comment body now."""

    revised = _call_bedrock(system, user_prompt)
    return {
        "draft": revised,
        "feedback": "",
        "status": "reviewing",
        "revision_count": state["revision_count"] + 1,
    }


def _build_generate_graph():
    graph = StateGraph(JiraDraftState)
    graph.add_node("generate_draft", generate_draft_node)
    graph.add_edge(START, "generate_draft")
    graph.add_edge("generate_draft", END)
    return graph.compile()


def _build_revise_graph():
    graph = StateGraph(JiraDraftState)
    graph.add_node("apply_feedback", apply_feedback_node)
    graph.add_edge(START, "apply_feedback")
    graph.add_edge("apply_feedback", END)
    return graph.compile()


_generate_graph = _build_generate_graph()
_revise_graph = _build_revise_graph()


def generate_initial_draft(
    context: str,
    tone: str = "formal",
    ticket_key: str = "",
) -> dict:
    """Generate a draft Jira comment and persist to S3."""
    draft_id = uuid.uuid4().hex[:8]
    label = _make_label(context)

    initial_state: JiraDraftState = {
        "context": context,
        "tone": tone,
        "label": label,
        "draft": "",
        "feedback": "",
        "status": "drafting",
        "revision_count": 0,
        "draft_id": draft_id,
        "ticket_key": ticket_key,
    }

    logger.info(f"Generating Jira comment draft: {draft_id} (ticket={ticket_key or '—'})")
    result = _generate_graph.invoke(initial_state)
    save_draft_state(result)
    logger.info(f"Draft {draft_id} generated ({len(result['draft'])} chars)")
    return result


def revise_draft(draft_id: str, feedback: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["feedback"] = feedback
    logger.info(f"Revising draft {draft_id} (revision #{state['revision_count'] + 1})")
    result = _revise_graph.invoke(state)
    save_draft_state(result)
    return result


def approve_draft(draft_id: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["status"] = "approved"
    save_draft_state(state)
    logger.info(f"Draft {draft_id} approved")
    return state


def mark_sent(draft_id: str) -> dict | None:
    state = load_draft_state(draft_id)
    if not state:
        return None
    state["status"] = "sent"
    save_draft_state(state)
    logger.info(f"Draft {draft_id} marked posted")
    return state
