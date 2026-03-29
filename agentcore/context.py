"""Context for passing session/ticket into @tool callables.

Uses a global dict instead of thread-local because Strands agent
and its tools may run in different threads via run_in_executor.
The _active_context is set before each agent call and read by tools.
"""

import threading

_thread_ctx = threading.local()

# Global context — set before agent call, read by tools
# This works because only one agent runs at a time per session
_active_context: dict = {
    "ticket_key": None,
    "session_id": None,
}

_lock = threading.Lock()


def set_active_context(ticket_key: str = "", session_id: str = ""):
    """Set the active context before running an agent."""
    with _lock:
        _active_context["ticket_key"] = ticket_key
        _active_context["session_id"] = session_id


def get_ticket_key() -> str:
    """Get the current ticket key — checks global context first, then thread-local."""
    # Global context (most reliable)
    tk = _active_context.get("ticket_key")
    if tk:
        return tk
    # Fallback to thread-local
    return getattr(_thread_ctx, "ticket_key", "") or ""


def get_session_id() -> str:
    """Get the current session ID."""
    sid = _active_context.get("session_id")
    if sid:
        return sid
    return getattr(_thread_ctx, "session_id", "") or ""
