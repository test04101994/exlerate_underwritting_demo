"""Strands tool: draft a Jira comment (reconciliation summary) for human review — not email."""

import logging

import context as ctx_mod
import state
from jira_comment_draft import generate_initial_draft as _gen_draft
from strands import tool

logger = logging.getLogger("agentcore")


@tool
def draft_jira_comment_summary(context: str, tone: str = "formal") -> str:
    """Draft a reconciliation or summary as a Jira ticket comment for human review before posting.

    Use when the user wants to write, compose, or draft a summary or comment for the current ticket.
    Pass the full intent in `context` (what the comment should cover). This is NOT email — do not
    ask for To/Subject; one `context` string is enough.

    Args:
        context: What the Jira comment should say or cover (topic, facts, audience hints in prose).
        tone: formal, casual, friendly, or urgent (default: formal).

    Returns:
        Confirmation that the draft is ready for review in the UI.
    """
    ticket_key = ctx_mod.get_ticket_key()

    try:
        state_result = _gen_draft(
            context=context.strip(),
            tone=tone,
            ticket_key=ticket_key,
        )

        state._pending_drafts_queue["__latest__"] = state_result
        logger.info("[draft_jira_comment_summary] Stored draft in __latest__ queue")

        lbl = state_result.get("label", "")[:60]
        logger.info(f"[draft_jira_comment_summary] Draft {state_result['draft_id']} ({lbl!r})")
        return (
            "Draft Jira comment generated and sent to the review panel. "
            "Approve to post it on the ticket, or request changes."
        )

    except Exception as e:
        logger.error(f"[draft_jira_comment_summary] Error: {e}")
        return f"Error generating draft comment: {str(e)}"
