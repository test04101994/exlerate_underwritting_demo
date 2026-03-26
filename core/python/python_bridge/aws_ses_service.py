"""
AWS SES Email Service for Email Sending Agent
"""

import boto3
import json
import logging
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AWSSESService:
    """AWS SES service for sending emails"""

    def __init__(self):
        """Initialize AWS SES client with temporary credentials"""
        self.session = boto3.Session(
            aws_access_key_id='',
            aws_secret_access_key='FbOkvQe4E4XMsQ2y51K1OR8NNdfNWq5+nhpwT/Hb',
            aws_session_token=
            'IQoJb3JpZ2luX2VjEA0aCWV1LXdlc3QtMiJHMEUCIAGxXjcC5py2OREDbRGQbwRoAk9ziLwK1ajRjOJ3+Q8cAiEAuut0Rn+vpJUk6M0XGbI02hLEiQEEKwjaw5soYlD5+JYqvAUIJhAAGgwzNTI5NTc3MjgzNzMiDLYl9CLqJROVOXhj5CqZBVQ/jwPAPgZA1Dh+ZQOybKR4JEtLbGiQMvyGkJb324j3a+U9DdWEk2FQKea2BLv9Q2ENWF+HP9gDStvh1rjEy0dl0nYp6BBmYNkqQXHaMAb5/8hByRO3DSm2YYzsC2EwXwEBExvr3TRQXA04DfDV8N5vkVCutT+vniE/RMMtffKHjvaX/M0mdx5RDnZUprXoPO5Bo9bjccyVCwJ1mYha3zPylDe1Vnj6wxy0nBFxfD9hcs1ioLifSAo+pLK/RCGbLPC4q5g0N6PNP1/b6TJi9JWPLwDwxrAzaIRcDohTdq/8X/hY47VLNv84U8hKle5MS+Qn/NsEGuqa1reyZLi4+CnH5LKOXcnlVV2JGQj0ccU2+wdM0vTmeeQ9HqMppbDkN08A0wUt4+bQE0O/LNcXR3rLTuvQ8Ncho5To4Dk7XF8TpTu9SkIxIOlXPL52nf1mUGvB0QAlMzg8zpJX1pseu9aeAbaEnXDSoYeUPnbfeGd/Y6GSyQP08ZQIjdn41WDTFJV4KrqBkoxvjL61VDP2FhnqsumdvZhp3wj6HTvZRll3iZQ+bDuTHpaAsPz9uj2b6i+w92Ei+yfe1t1opuCj8qSRGfW0L1eLG3xJf3OjfU+7oDjMPr2AzmRVPE6gDu9ZUIjR06DShackO7mqNJKZcTCI4Ng+HumGzwxxrURq1nUO6pnDw/+HwfPzN2YDxacNaQWE829bx5Y3Tpl6uUXKm4NxNtVFwmEFbR7MtnbamhtzbjnyvGP6Rf9a1HJTLJcCllazFqoahxIGKw2ufkezitaeaybkNN9weT6WCD8fy+7rwJxj+YGNsAqu9Rm4rA3JCoi99Q7nX0klVyGT2ywU4iyEtqjoOYU4b4Y2wb1JXhCCgiuRraunNxNvMNqa0sMGOrEB2CokE9w2i+76dWyF+vj8cGRsgw9MwdQgK662vwQnvSGnjlpJIINd0z0q+IS2r99s92Liahhj5leJhWaYZEKdawxXg7rcEbghPNVN2ft4Q1Coy+FKETMurdkT5WobvwetvPojJzs4Rk5YBAWcVzA8Ec0j9VtESuWY/oWB9rBPRIFys6thlTbbOwS2+whfLGYiEv5qO1MpuZleQJU+fkiCbrBLIc7cPA/iiU6GS+8ViWmZ'
        )

        self.ses_client = self.session.client('ses', region_name='eu-west-2')

        # Default sender email (verified domain)
        self.default_sender = 'no-reply@dev-c35c036f.digitalfoundryx.com'
        self.default_recipient = 'paras.ghai@exlservice.com'

        logger.info("AWS SES service initialized successfully")

    def send_email(self,
                   to_email: str,
                   subject: str,
                   body: str,
                   from_email: Optional[str] = None,
                   is_html: bool = False) -> Dict[str, Any]:
        """
        Send email via AWS SES
        
        Args:
            to_email: Recipient email address
            subject: Email subject
            body: Email body content
            from_email: Sender email (optional, uses default if not provided)
            is_html: Whether body is HTML format
            
        Returns:
            Dict containing success status and message ID or error details
        """
        try:
            sender = from_email or self.default_sender

            # Prepare message body
            message_body = {}
            if is_html:
                message_body['Html'] = {'Data': body}
            else:
                message_body['Text'] = {'Data': body}

            # Send email
            response = self.ses_client.send_email(
                Source=sender,
                Destination={'ToAddresses': [to_email]},
                Message={
                    'Subject': {
                        'Data': subject
                    },
                    'Body': message_body
                })

            message_id = response['MessageId']
            logger.info(f"Email sent successfully! Message ID: {message_id}")

            return {
                'success': True,
                'message_id': message_id,
                'to_email': to_email,
                'subject': subject,
                'sender': sender
            }

        except ClientError as e:
            error_code = e.response['Error']['Code']
            error_message = e.response['Error']['Message']
            logger.error(f"AWS SES error: {error_code} - {error_message}")

            return {
                'success': False,
                'error_code': error_code,
                'error_message': error_message,
                'to_email': to_email,
                'subject': subject
            }

        except Exception as e:
            logger.error(f"Unexpected error sending email: {str(e)}")

            return {
                'success': False,
                'error_code': 'UNKNOWN_ERROR',
                'error_message': str(e),
                'to_email': to_email,
                'subject': subject
            }

    def send_broker_notification(
            self, broker_email: str, broker_name: str, client_name: str,
            policy_details: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send broker notification email with policy details
        
        Args:
            broker_email: Broker's email address (will be overridden with hardcoded email)
            broker_name: Broker's name
            client_name: Client's name
            policy_details: Policy information dict
            
        Returns:
            Dict containing email send result
        """
        # Always use hardcoded email address
        broker_email = self.default_recipient
        subject = f"Policy Decision - {client_name} - {policy_details.get('policy_number', 'N/A')}"

        # Create email body
        body = f"""Dear {broker_name},

We have completed the underwriting review for your client {client_name}.

Policy Details:
- Policy Number: {policy_details.get('policy_number', 'N/A')}
- Premium Amount: £{policy_details.get('premium_amount', 'N/A')}
- Coverage Type: {policy_details.get('coverage_type', 'N/A')}
- Effective Date: {policy_details.get('effective_date', 'N/A')}
- Decision: {policy_details.get('decision', 'N/A')}

{policy_details.get('additional_notes', '')}

Please contact us if you have any questions regarding this decision.

Best regards,
EXL Underwriting Team
New Business Setup Department"""

        return self.send_email(to_email=broker_email,
                               subject=subject,
                               body=body)

    def send_rejection_notification(self, broker_email: str, broker_name: str,
                                    client_name: str,
                                    rejection_reason: str) -> Dict[str, Any]:
        """
        Send rejection notification email
        
        Args:
            broker_email: Broker's email address
            broker_name: Broker's name
            client_name: Client's name
            rejection_reason: Reason for rejection
            
        Returns:
            Dict containing email send result
        """
        subject = f"Application Declined - {client_name}"

        body = f"""Dear {broker_name},

We regret to inform you that the insurance application for {client_name} has been declined.

Reason for Decline:
{rejection_reason}

If you have any questions or would like to discuss this decision, please contact our underwriting team.

Best regards,
EXL Underwriting Team
New Business Setup Department"""

        return self.send_email(to_email=broker_email,
                               subject=subject,
                               body=body)


# Create global instance
aws_ses_service = AWSSESService()
