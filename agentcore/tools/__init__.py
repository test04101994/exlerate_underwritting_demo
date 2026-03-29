"""
Strands @tool callables grouped by domain.

Import from here for agent registration:

    from tools import ALL_AGENT_TOOLS
"""

from .calculator import add, divide, multiply, subtract
from .data_extraction_tool import extract_data
from .doc_analysis import doc_analysis
from .jira_comment_draft_tool import draft_jira_comment_summary
from .jira_tools import (
    jira_add_comment,
    jira_get_comments,
    jira_get_ticket,
    jira_search_tickets,
    jira_summarize_comments,
)

ALL_AGENT_TOOLS = [
    add,
    subtract,
    multiply,
    divide,
    doc_analysis,
    extract_data,
    jira_get_ticket,
    jira_get_comments,
    jira_add_comment,
    jira_search_tickets,
    jira_summarize_comments,
    draft_jira_comment_summary,
]

CALCULATOR_TOOLS = [
    add,
    subtract,
    multiply,
    divide,
]

__all__ = [
    "ALL_AGENT_TOOLS",
    "add",
    "subtract",
    "multiply",
    "divide",
    "doc_analysis",
    "extract_data",
    "jira_get_ticket",
    "jira_get_comments",
    "jira_add_comment",
    "jira_search_tickets",
    "jira_summarize_comments",
    "draft_jira_comment_summary",
]
