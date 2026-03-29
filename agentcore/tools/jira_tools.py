"""Jira @tool implementations: read/search tickets, comments, and AI comment summaries."""

import logging

import requests
from strands import tool

import settings
from .jira_client import get_jira_config, jira_headers, post_jira_comment_v3

logger = logging.getLogger("agentcore")


@tool
def jira_get_comments(ticket_key: str) -> str:
    """Read all comments from a Jira ticket. Use when the user asks to see comments, \
discussion, or conversation on a Jira ticket.

    Args:
        ticket_key: The Jira ticket key (e.g., HIS-90, XSX-4113)

    Returns:
        All comments on the ticket with author and timestamp
    """
    try:
        cfg = get_jira_config()
        url = f"{cfg['base_url']}/rest/api/2/issue/{ticket_key}/comment"
        resp = requests.get(url, headers=jira_headers(), timeout=15)
        resp.raise_for_status()

        data = resp.json()
        comments = data.get("comments", [])

        if not comments:
            return f"No comments found on {ticket_key}."

        result_parts = [f"Comments on {ticket_key} ({len(comments)} total):\n"]
        for i, c in enumerate(comments, 1):
            author = c.get("author", {}).get("displayName", "Unknown")
            created = c.get("created", "")[:16].replace("T", " ")
            body = ""
            if "body" in c:
                body_content = c["body"]
                if isinstance(body_content, dict):
                    for block in body_content.get("content", []):
                        for inline in block.get("content", []):
                            body += inline.get("text", "")
                        body += "\n"
                else:
                    body = str(body_content)
            body = body.strip() or "(empty)"
            result_parts.append(f"**Comment {i}** by {author} ({created}):\n{body}\n")

        return "\n".join(result_parts)
    except Exception as e:
        logger.error(f"Jira get comments error: {e}")
        return f"Error reading comments from {ticket_key}: {str(e)}"


@tool
def jira_add_comment(ticket_key: str, comment_text: str) -> str:
    """Post a new comment on a Jira ticket. Use when the user asks to add, write, \
or post a comment on a Jira ticket.

    Args:
        ticket_key: The Jira ticket key (e.g., HIS-90)
        comment_text: The comment text to post

    Returns:
        Confirmation that the comment was posted
    """
    try:
        post_jira_comment_v3(ticket_key, comment_text)
        return f"Comment posted successfully on {ticket_key}."
    except Exception as e:
        logger.error(f"Jira add comment error: {e}")
        return f"Error posting comment to {ticket_key}: {str(e)}"


@tool
def jira_get_ticket(ticket_key: str) -> str:
    """Get details of a Jira ticket including summary, status, assignee, and description. \
Use when the user asks about a specific Jira ticket or issue.

    Args:
        ticket_key: The Jira ticket key (e.g., HIS-90)

    Returns:
        Ticket details including summary, status, priority, assignee
    """
    try:
        cfg = get_jira_config()
        url = f"{cfg['base_url']}/rest/api/2/issue/{ticket_key}"
        resp = requests.get(url, headers=jira_headers(), timeout=15)
        resp.raise_for_status()

        data = resp.json()
        fields = data.get("fields", {})

        summary = fields.get("summary", "N/A")
        status = fields.get("status", {}).get("name", "N/A")
        priority = fields.get("priority", {}).get("name", "N/A")
        assignee = fields.get("assignee", {})
        assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
        reporter = fields.get("reporter", {}).get("displayName", "N/A")
        created = fields.get("created", "")[:10]
        updated = fields.get("updated", "")[:10]
        issue_type = fields.get("issuetype", {}).get("name", "N/A")

        desc = ""
        desc_field = fields.get("description")
        if isinstance(desc_field, dict):
            for block in desc_field.get("content", []):
                for inline in block.get("content", []):
                    desc += inline.get("text", "")
                desc += "\n"
        elif desc_field:
            desc = str(desc_field)
        desc = desc.strip() or "No description"

        return (
            f"**{ticket_key}**: {summary}\n"
            f"- **Type**: {issue_type}\n"
            f"- **Status**: {status}\n"
            f"- **Priority**: {priority}\n"
            f"- **Assignee**: {assignee_name}\n"
            f"- **Reporter**: {reporter}\n"
            f"- **Created**: {created} | **Updated**: {updated}\n"
            f"- **Description**: {desc[:500]}"
        )
    except Exception as e:
        logger.error(f"Jira get ticket error: {e}")
        return f"Error fetching ticket {ticket_key}: {str(e)}"


@tool
def jira_search_tickets(query: str) -> str:
    """Search for Jira tickets using a text query or JQL. Use when the user asks to \
find, search, or list Jira tickets.

    Args:
        query: Search text or JQL query (e.g., "login bug", "status = Open")

    Returns:
        List of matching tickets with key, summary, status
    """
    try:
        cfg = get_jira_config()
        project = cfg.get("project_key", "HIS")

        if any(op in query.lower() for op in ["=", "in", "order by", "and", "or"]):
            jql = query
        else:
            jql = f'project = "{project}" AND text ~ "{query}" ORDER BY updated DESC'

        url = f"{cfg['base_url']}/rest/api/3/search/jql"
        params = {"jql": jql, "maxResults": 10, "fields": "summary,status,priority,assignee"}
        resp = requests.get(url, headers=jira_headers(), params=params, timeout=15)
        resp.raise_for_status()

        data = resp.json()
        issues = data.get("issues", [])

        if not issues:
            return f"No tickets found for: {query}"

        result_parts = [f"Found {len(issues)} ticket(s):\n"]
        for issue in issues:
            key = issue["key"]
            fields = issue.get("fields", {})
            summary = fields.get("summary", "N/A")
            status = fields.get("status", {}).get("name", "N/A")
            priority = fields.get("priority", {}).get("name", "N/A")
            assignee = fields.get("assignee", {})
            assignee_name = assignee.get("displayName", "Unassigned") if assignee else "Unassigned"
            result_parts.append(f"- **{key}**: {summary} [{status}] P:{priority} → {assignee_name}")

        return "\n".join(result_parts)
    except Exception as e:
        logger.error(f"Jira search error: {e}")
        return f"Error searching Jira: {str(e)}"


@tool
def jira_summarize_comments(ticket_key: str) -> str:
    """Create an AI-powered summary of all comments on a Jira ticket. Use when the user \
asks for a summary, overview, or digest of the discussion on a ticket.

    Args:
        ticket_key: The Jira ticket key (e.g., HIS-90)

    Returns:
        AI-generated summary of the comment thread
    """
    try:
        cfg = get_jira_config()
        url = f"{cfg['base_url']}/rest/api/2/issue/{ticket_key}/comment"
        resp = requests.get(url, headers=jira_headers(), timeout=15)
        resp.raise_for_status()

        data = resp.json()
        comments = data.get("comments", [])

        if not comments:
            return f"No comments to summarize on {ticket_key}."

        thread_parts = []
        for c in comments:
            author = c.get("author", {}).get("displayName", "Unknown")
            created = c.get("created", "")[:16].replace("T", " ")
            body = ""
            if "body" in c:
                body_content = c["body"]
                if isinstance(body_content, dict):
                    for block in body_content.get("content", []):
                        for inline in block.get("content", []):
                            body += inline.get("text", "")
                        body += "\n"
                else:
                    body = str(body_content)
            thread_parts.append(f"{author} ({created}): {body.strip()}")

        thread = "\n\n".join(thread_parts)

        summary_response = settings.bedrock_runtime.converse(
            modelId=settings.LLM_MODEL_ID,
            system=[{"text": "You are a concise assistant. Summarize the following Jira ticket comment thread. Highlight key decisions, action items, and any blockers or questions raised. Be brief and structured."}],
            messages=[{
                "role": "user",
                "content": [{"text": f"Ticket: {ticket_key}\n\nComment thread ({len(comments)} comments):\n\n{thread}"}],
            }],
            inferenceConfig={"maxTokens": 512},
        )

        summary = summary_response["output"]["message"]["content"][0]["text"]
        return f"**Summary of {ticket_key}** ({len(comments)} comments):\n\n{summary}"
    except Exception as e:
        logger.error(f"Jira summarize error: {e}")
        return f"Error summarizing comments for {ticket_key}: {str(e)}"
