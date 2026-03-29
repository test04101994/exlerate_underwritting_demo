#!/bin/bash
set -e

BUCKET="underwriting-app-emails"
KEY="lambda/email-processor.zip"
FUNCTION_NAME="production-email-processor-v3"
REGION="us-east-1"

echo "==> Packaging Lambda..."
cd "$(dirname "$0")"

# Create a clean zip with just handler.py
rm -f /tmp/email-processor.zip
zip -j /tmp/email-processor.zip handler.py

echo "==> Uploading to s3://${BUCKET}/${KEY}..."
aws s3 cp /tmp/email-processor.zip "s3://${BUCKET}/${KEY}"

echo "==> Updating Lambda function code..."
aws lambda update-function-code \
  --function-name "${FUNCTION_NAME}" \
  --s3-bucket "${BUCKET}" \
  --s3-key "${KEY}" \
  --region "${REGION}"

echo "==> Done! Lambda updated."
