"""
AWS Lambda: Email Send via SES

Invoked by AgentCore after a human approves an email draft.
In SIMULATION_MODE, logs the email instead of sending.

Environment Variables:
  SES_SENDER_EMAIL  — Verified SES sender email
  SES_REGION        — SES region (default: us-east-1)
  SIMULATION_MODE   — Set to "true" to log instead of sending
"""

import json
import os
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SES_SENDER_EMAIL = os.environ.get("SES_SENDER_EMAIL", "noreply@example.com")
SES_REGION = os.environ.get("SES_REGION", "us-east-1")
SIMULATION_MODE = os.environ.get("SIMULATION_MODE", "true").lower() == "true"


def handler(event, context):
    """
    Lambda entry point.

    Input (from API Gateway or direct invoke):
    {
        "to": "recipient@example.com",
        "subject": "Email subject",
        "body": "Email body text",
        "ticket_key": "ACC-4" (optional)
    }
    """
    logger.info(f"Email send Lambda invoked")

    # Parse body
    body = event.get("body", event)
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid JSON body"}),
            }

    recipient = body.get("to", "")
    subject = body.get("subject", "No Subject")
    email_body = body.get("body", "")
    ticket_key = body.get("ticket_key", "")

    if not recipient:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing 'to' field"}),
        }

    if not email_body:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing 'body' field"}),
        }

    if SIMULATION_MODE:
        logger.info(f"[SIMULATION] Email to: {recipient}")
        logger.info(f"[SIMULATION] Subject: {subject}")
        logger.info(f"[SIMULATION] Body: {email_body[:500]}")
        logger.info(f"[SIMULATION] Ticket: {ticket_key}")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "sent",
                "messageId": "simulated-" + os.urandom(8).hex(),
                "simulation": True,
                "to": recipient,
                "subject": subject,
            }),
        }

    # Send via SES
    try:
        ses = boto3.client("ses", region_name=SES_REGION)
        response = ses.send_email(
            Source=SES_SENDER_EMAIL,
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": email_body, "Charset": "UTF-8"},
                },
            },
        )
        message_id = response.get("MessageId", "unknown")
        logger.info(f"Email sent: {message_id} to {recipient}")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "status": "sent",
                "messageId": message_id,
                "to": recipient,
                "subject": subject,
            }),
        }
    except Exception as e:
        logger.error(f"SES send failed: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": f"Failed to send email: {str(e)}",
            }),
        }
