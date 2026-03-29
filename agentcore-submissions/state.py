"""Shared in-memory state for WebSocket sessions and cross-thread draft handoff.

Long-term memory is handled by AgentCore MemoryClient (see settings.py).
"""

# session_id -> {"ticket_key": str | None, "uploaded_docs": list}
_session_context: dict[str, dict] = {}

# Cross-thread queue: "__latest__" -> draft state from draft_jira_comment_summary tool
_pending_drafts_queue: dict[str, dict] = {}

# Cross-thread queue: "__latest__" -> extraction state from extract_data tool
_pending_extractions_queue: dict[str, dict] = {}
