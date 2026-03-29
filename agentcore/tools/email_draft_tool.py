"""Strands tool: draft an email for human review — approve to send via SES, or revise."""

import logging

import context as ctx_mod
import state
from email_draft import generate_initial_draft as _gen_draft
from strands import tool

logger = logging.getLogger("agentcore")


@tool
def draft_email(context: str, to: str = "", subject: str = "", tone: str = "formal") -> str:
    """Draft an email for human review before sending via SES. The email will be shown \
in the UI for the user to approve, revise with feedback, or reject.

    Use when the user asks to draft, write, compose, or send an email related to the submission.

    Args:
        context: What the email should cover — topic, key points, any specific details to include.
        to: Recipient email address (if known). Can be left empty for user to fill in.
        subject: Email subject line. If empty, one will be generated from context.
        tone: formal, casual, friendly, or urgent (default: formal).

    Returns:
        Confirmation that the draft is ready for review in the UI.
    """
    submission_id = ctx_mod.get_ticket_key()

    try:
        state_result = _gen_draft(
            context=context.strip(),
            to=to.strip(),
            subject=subject.strip(),
            tone=tone,
            submission_id=submission_id or "",
        )

        state._pending_drafts_queue["__latest__"] = state_result
        logger.info("[draft_email] Stored email draft in __latest__ queue")

        return (
            "Email draft generated and sent to the review panel. "
            "You can approve to send it, or provide feedback to revise."
        )

    except Exception as e:
        logger.error(f"[draft_email] Error: {e}")
        return f"Error generating email draft: {str(e)}"
