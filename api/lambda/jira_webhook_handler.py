"""
AWS Lambda: Jira Webhook → AgentCore Plan Generator

Triggered by API Gateway when a Jira webhook fires.
Generates an action plan using Bedrock and pushes it to
the AgentCore WebSocket server for user approval.

Environment Variables:
  AGENTCORE_URL  — AgentCore HTTP endpoint (e.g., https://agentcore.example.com)
  JIRA_BASE_URL  — Jira instance URL
  JIRA_EMAIL     — Jira service account email
  JIRA_API_TOKEN — Jira API token
  AWS_REGION     — Bedrock region (default: us-east-1)
"""

import json
import os
import logging
import urllib.request
import urllib.parse
import base64
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AGENTCORE_URL = os.environ.get("AGENTCORE_URL", "http://localhost:8080")
JIRA_BASE_URL = os.environ.get("JIRA_BASE_URL", "")
JIRA_EMAIL = os.environ.get("JIRA_EMAIL", "")
JIRA_API_TOKEN = os.environ.get("JIRA_API_TOKEN", "")
BEDROCK_REGION = os.environ.get("AWS_REGION", "us-east-1")


def _jira_headers():
    """Build Jira REST API auth headers."""
    creds = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_API_TOKEN}".encode()).decode()
    return {
        "Authorization": f"Basic {creds}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _jira_get(path: str) -> dict:
    """GET a Jira REST API endpoint."""
    url = f"{JIRA_BASE_URL}{path}"
    req = urllib.request.Request(url, headers=_jira_headers())
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())


def _generate_plan(ticket_key: str, context: str) -> dict:
    """Use Bedrock Nova Lite to generate an action plan."""
    bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)

    prompt = f"""A Jira ticket was updated. Based on the context below, create an action plan.

{context}

Return a JSON object with:
- "goal": a one-line summary of what needs to be done
- "steps": array of 3-5 specific action steps

Return ONLY valid JSON, no other text."""

    try:
        resp = bedrock.converse(
            modelId="amazon.nova-lite-v1:0",
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 500, "temperature": 0.3},
        )
        import re
        raw = resp["output"]["message"]["content"][0]["text"]
        json_match = re.search(r'\{[\s\S]*\}', raw)
        if json_match:
            return json.loads(json_match.group())
    except Exception as e:
        logger.error(f"Bedrock plan generation failed: {e}")

    # Fallback plan
    return {
        "goal": f"Review updated ticket {ticket_key}",
        "steps": [
            f"Fetch full details of {ticket_key}",
            f"Read all comments on {ticket_key}",
            "Generate summary with key decisions and action items",
        ],
    }


def _push_to_agentcore(plan: dict) -> dict:
    """POST the plan to AgentCore's webhook endpoint."""
    url = f"{AGENTCORE_URL}/webhook/jira"
    data = json.dumps(plan).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def handler(event, context):
    """
    Lambda entry point.

    API Gateway passes the Jira webhook payload in event['body'].
    Jira webhook payload contains:
      - webhookEvent: e.g., "jira:issue_updated"
      - issue: { key, fields: { summary, status, ... } }
    """
    logger.info(f"Lambda invoked: {json.dumps(event)[:500]}")

    # Parse body (API Gateway proxy format)
    body = event.get("body", "{}")
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid JSON body"}),
            }

    # Extract Jira webhook fields
    webhook_event = body.get("webhookEvent", "jira:issue_updated")
    issue = body.get("issue", {})
    ticket_key = issue.get("key", body.get("ticket_key", ""))

    if not ticket_key:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "No ticket_key in payload"}),
        }

    event_type = webhook_event.replace("jira:", "").replace("_", " ")
    logger.info(f"Processing: {event_type} on {ticket_key}")

    # Fetch ticket context from Jira
    ticket_context = f"Ticket: {ticket_key}"
    try:
        ticket = _jira_get(f"/rest/api/2/issue/{ticket_key}")
        fields = ticket.get("fields", {})
        ticket_context = (
            f"Ticket: {ticket_key}\n"
            f"Type: {fields.get('issuetype', {}).get('name', 'Unknown')}\n"
            f"Status: {fields.get('status', {}).get('name', 'Unknown')}\n"
            f"Summary: {fields.get('summary', 'No summary')}"
        )

        # Get last few comments
        comments_data = _jira_get(f"/rest/api/2/issue/{ticket_key}/comment")
        comments = comments_data.get("comments", [])
        if comments:
            comment_lines = []
            for c in comments[-5:]:
                author = c.get("author", {}).get("displayName", "Unknown")
                text = c.get("body", "")[:150]
                comment_lines.append(f"- {author}: {text}")
            ticket_context += "\n\nRecent comments:\n" + "\n".join(comment_lines)
    except Exception as e:
        logger.warning(f"Jira fetch failed: {e}")

    # Generate plan
    plan = _generate_plan(ticket_key, ticket_context)

    # Push to AgentCore
    try:
        result = _push_to_agentcore({
            "ticket_key": ticket_key,
            "event_type": event_type,
            "summary": plan.get("goal"),
        })
        logger.info(f"Plan pushed: {result}")
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "status": "ok",
                "ticket_key": ticket_key,
                "plan": plan,
                "agentcore_response": result,
            }),
        }
    except Exception as e:
        logger.error(f"AgentCore push failed: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": f"Failed to push plan: {str(e)}",
                "plan": plan,
            }),
        }
