#!/bin/bash
#
# load-ssm-env.sh — Load SSM parameters into environment variables
#
# Usage:
#   eval $(./scripts/load-ssm-env.sh)
#   eval $(./scripts/load-ssm-env.sh --env staging)
#

ENV="${2:-production}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
PREFIX="/agentcore/${ENV}"

# Fetch all params under the prefix
PARAMS=$(aws ssm get-parameters-by-path \
  --path "$PREFIX" \
  --recursive \
  --region "$REGION" \
  --query "Parameters[*].[Name,Value]" \
  --output text 2>/dev/null)

if [ -z "$PARAMS" ]; then
  echo "# No SSM parameters found under $PREFIX" >&2
  exit 1
fi

# Map SSM paths to env var names
while IFS=$'\t' read -r name value; do
  case "$name" in
    */vectors/bucket-name)  echo "export VECTOR_BUCKET_NAME='$value'" ;;
    */vectors/index-name)   echo "export VECTOR_INDEX_NAME='$value'" ;;
    */vectors/dimension)    echo "export VECTOR_DIMENSION='$value'" ;;
    */memory/memory-id)     echo "export AGENTCORE_MEMORY_ID='$value'" ;;
    */memory/memory-name)   echo "export AGENTCORE_MEMORY_NAME='$value'" ;;
    */s3/documents-bucket)  echo "export S3_BUCKET='$value'" ;;
    */s3/jira-cases-bucket) echo "export JIRA_CASES_BUCKET='$value'" ;;
    */region)               echo "export AWS_REGION='$value'" ;;
  esac
done <<< "$PARAMS"
