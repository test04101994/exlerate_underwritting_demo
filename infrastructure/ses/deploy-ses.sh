#!/bin/bash
set -euo pipefail

# ============================================================================
# Deploy SES Email Receiving Stack for underwriting-app.com
# ============================================================================

STACK_NAME="underwriting-app-ses"
TEMPLATE_FILE="$(dirname "$0")/ses-email-receiving.yaml"
REGION="${AWS_REGION:-us-east-1}"
DOMAIN_NAME="underwriting-app.com"
BUCKET_NAME="underwriting-app-emails"

echo "============================================"
echo "  Deploying SES Email Receiving Stack"
echo "  Domain:  ${DOMAIN_NAME}"
echo "  Region:  ${REGION}"
echo "  Bucket:  ${BUCKET_NAME}"
echo "============================================"
echo ""

# Validate template
echo "[1/4] Validating CloudFormation template..."
aws cloudformation validate-template \
  --template-body "file://${TEMPLATE_FILE}" \
  --region "${REGION}" \
  > /dev/null

echo "[2/4] Deploying stack '${STACK_NAME}'..."
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_FILE}" \
  --parameter-overrides \
    DomainName="${DOMAIN_NAME}" \
    EmailBucketName="${BUCKET_NAME}" \
    Environment=production \
  --region "${REGION}" \
  --no-fail-on-empty-changeset \
  --capabilities CAPABILITY_IAM

echo "[3/4] Activating receipt rule set..."
aws ses set-active-receipt-rule-set \
  --rule-set-name underwriting-app-ruleset \
  --region "${REGION}" 2>/dev/null || echo "  (Rule set may already be active or another is active — check SES console)"

echo "[4/4] Fetching DNS records you need to configure..."
echo ""
echo "============================================"
echo "  DNS RECORDS TO ADD"
echo "============================================"
echo ""

# -- MX Record --
echo "1) MX RECORD (required — routes email to SES)"
echo "   Type:     MX"
echo "   Name:     ${DOMAIN_NAME}"
echo "   Priority: 10"
echo "   Value:    inbound-smtp.${REGION}.amazonaws.com"
echo ""

# -- DKIM CNAME Records --
echo "2) DKIM CNAME RECORDS (required — for email authentication)"
echo "   Fetching from SES..."
echo ""

DKIM_TOKENS=$(aws ses get-identity-dkim-attributes \
  --identities "${DOMAIN_NAME}" \
  --region "${REGION}" \
  --query "DkimAttributes.\"${DOMAIN_NAME}\".DkimTokens[]" \
  --output text 2>/dev/null || echo "")

if [ -n "${DKIM_TOKENS}" ] && [ "${DKIM_TOKENS}" != "None" ]; then
  for TOKEN in ${DKIM_TOKENS}; do
    echo "   Type:  CNAME"
    echo "   Name:  ${TOKEN}._domainkey.${DOMAIN_NAME}"
    echo "   Value: ${TOKEN}.dkim.amazonses.com"
    echo ""
  done
else
  echo "   DKIM tokens not yet available. Run this after a few minutes:"
  echo "   aws ses get-identity-dkim-attributes --identities ${DOMAIN_NAME} --region ${REGION}"
  echo ""
fi

# -- TXT Record for SPF (optional but recommended) --
echo "3) SPF TXT RECORD (recommended — for outbound email validation)"
echo "   Type:  TXT"
echo "   Name:  ${DOMAIN_NAME}"
echo "   Value: \"v=spf1 include:amazonses.com ~all\""
echo ""

# -- Domain verification TXT --
echo "4) DOMAIN VERIFICATION TXT RECORD"
VERIFICATION_TOKEN=$(aws ses get-identity-verification-attributes \
  --identities "${DOMAIN_NAME}" \
  --region "${REGION}" \
  --query "VerificationAttributes.\"${DOMAIN_NAME}\".VerificationToken" \
  --output text 2>/dev/null || echo "")

if [ -n "${VERIFICATION_TOKEN}" ] && [ "${VERIFICATION_TOKEN}" != "None" ]; then
  echo "   Type:  TXT"
  echo "   Name:  _amazonses.${DOMAIN_NAME}"
  echo "   Value: ${VERIFICATION_TOKEN}"
else
  echo "   Verification token not yet available. Run:"
  echo "   aws ses get-identity-verification-attributes --identities ${DOMAIN_NAME} --region ${REGION}"
fi

echo ""
echo "============================================"
echo "  STACK OUTPUTS"
echo "============================================"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${REGION}" \
  --query 'Stacks[0].Outputs[*].[OutputKey, OutputValue]' \
  --output table 2>/dev/null || echo "Stack outputs not available yet."

echo ""
echo "Done! Add the DNS records above, then verify domain status with:"
echo "  aws ses get-identity-verification-attributes --identities ${DOMAIN_NAME} --region ${REGION}"
echo ""
