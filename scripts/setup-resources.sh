#!/bin/bash
#
# setup-resources.sh — Create S3 Vectors + AgentCore Memory
#
# Creates resources that don't have CloudFormation support yet,
# stores their IDs in SSM Parameter Store so the stack and app
# can reference them without hardcoding.
#
# Usage:
#   ./scripts/setup-resources.sh                  # uses defaults
#   ./scripts/setup-resources.sh --env staging     # custom env prefix
#
# After running, the app reads config from SSM:
#   /agentcore/{env}/vectors/bucket-name
#   /agentcore/{env}/vectors/index-name
#   /agentcore/{env}/memory/memory-id
#

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── Parse args ───────────────────────────────────────────────────────────────
ENV="production"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
SSM_PREFIX="/agentcore/${ENV}"

# Resource names derived from account + env (no hardcoding)
VECTOR_BUCKET="agentcore-vectors-${ACCOUNT_ID}-${ENV}"
VECTOR_INDEX="pdf-chunks"
VECTOR_DIMENSION=1024
MEMORY_NAME="agentcore_ticket_memory_${ENV}"

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🚀  AgentCore Resource Setup              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Account:  ${GREEN}${ACCOUNT_ID}${NC}"
echo -e "  Region:   ${GREEN}${REGION}${NC}"
echo -e "  Env:      ${GREEN}${ENV}${NC}"
echo -e "  SSM:      ${GREEN}${SSM_PREFIX}/*${NC}"
echo ""

# ── 1. S3 Vectors Bucket ────────────────────────────────────────────────────
echo -e "${BLUE}[1/4] Creating S3 Vectors bucket: ${YELLOW}${VECTOR_BUCKET}${NC}"
EXISTING_BUCKET=$(aws s3vectors list-vector-buckets --region "$REGION" \
  --query "vectorBuckets[?vectorBucketName=='${VECTOR_BUCKET}'].vectorBucketName" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_BUCKET" ] && [ "$EXISTING_BUCKET" != "None" ]; then
  echo -e "  ${GREEN}✓ Already exists${NC}"
else
  aws s3vectors create-vector-bucket \
    --vector-bucket-name "$VECTOR_BUCKET" \
    --region "$REGION" \
    --output text > /dev/null
  echo -e "  ${GREEN}✓ Created${NC}"
fi

# ── 2. S3 Vectors Index ─────────────────────────────────────────────────────
echo -e "${BLUE}[2/4] Creating vector index: ${YELLOW}${VECTOR_INDEX}${NC}"
EXISTING_INDEX=$(aws s3vectors list-indexes \
  --vector-bucket-name "$VECTOR_BUCKET" \
  --region "$REGION" \
  --query "indexes[?indexName=='${VECTOR_INDEX}'].indexName" \
  --output text 2>/dev/null || echo "")

if [ -n "$EXISTING_INDEX" ] && [ "$EXISTING_INDEX" != "None" ]; then
  echo -e "  ${GREEN}✓ Already exists${NC}"
else
  aws s3vectors create-index \
    --vector-bucket-name "$VECTOR_BUCKET" \
    --index-name "$VECTOR_INDEX" \
    --dimension "$VECTOR_DIMENSION" \
    --distance-metric cosine \
    --data-type float32 \
    --region "$REGION" \
    --output text > /dev/null
  echo -e "  ${GREEN}✓ Created (dimension=${VECTOR_DIMENSION}, cosine)${NC}"
fi

# ── 3. AgentCore Memory ─────────────────────────────────────────────────────
echo -e "${BLUE}[3/4] Creating AgentCore Memory: ${YELLOW}${MEMORY_NAME}${NC}"
MEMORY_ID=$(python3 -c "
from bedrock_agentcore.memory import MemoryClient
mc = MemoryClient(region_name='${REGION}')
result = mc.create_or_get_memory(
    name='${MEMORY_NAME}',
    description='Per-ticket conversation memory for AgentCore agents (${ENV})',
)
# Result can be dict with 'memory' key or direct
mem = result if isinstance(result, dict) and 'memoryId' in result else result.get('memory', result)
mid = mem.get('memoryId', '') if isinstance(mem, dict) else str(mem)
print(mid)
" 2>/dev/null || echo "")

if [ -z "$MEMORY_ID" ]; then
  echo -e "  ${RED}✗ Failed to create memory. Check bedrock-agentcore SDK.${NC}"
  MEMORY_ID="MANUAL_SETUP_REQUIRED"
else
  echo -e "  ${GREEN}✓ Memory ID: ${MEMORY_ID}${NC}"
fi

# ── 4. Store in SSM Parameter Store ──────────────────────────────────────────
echo -e "${BLUE}[4/4] Storing config in SSM Parameter Store...${NC}"

declare -A PARAMS=(
  ["${SSM_PREFIX}/vectors/bucket-name"]="$VECTOR_BUCKET"
  ["${SSM_PREFIX}/vectors/index-name"]="$VECTOR_INDEX"
  ["${SSM_PREFIX}/vectors/dimension"]="$VECTOR_DIMENSION"
  ["${SSM_PREFIX}/memory/memory-id"]="$MEMORY_ID"
  ["${SSM_PREFIX}/memory/memory-name"]="$MEMORY_NAME"
  ["${SSM_PREFIX}/s3/documents-bucket"]="agentcore-docs-${ACCOUNT_ID}"
  ["${SSM_PREFIX}/s3/jira-cases-bucket"]="jira-cases-${ACCOUNT_ID}-prod"
  ["${SSM_PREFIX}/region"]="$REGION"
)

for key in "${!PARAMS[@]}"; do
  aws ssm put-parameter \
    --name "$key" \
    --value "${PARAMS[$key]}" \
    --type String \
    --overwrite \
    --region "$REGION" \
    --output text > /dev/null 2>&1
  echo -e "  ${GREEN}✓${NC} ${key} = ${PARAMS[$key]}"
done

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅  Setup Complete!                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "SSM Parameters created under ${YELLOW}${SSM_PREFIX}/*${NC}:"
echo ""
echo "  Vectors:"
echo "    bucket-name  = $VECTOR_BUCKET"
echo "    index-name   = $VECTOR_INDEX"
echo "    dimension    = $VECTOR_DIMENSION"
echo ""
echo "  Memory:"
echo "    memory-id    = $MEMORY_ID"
echo "    memory-name  = $MEMORY_NAME"
echo ""
echo "  S3:"
echo "    documents    = agentcore-docs-${ACCOUNT_ID}"
echo "    jira-cases   = jira-cases-${ACCOUNT_ID}-prod"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Update CloudFormation stack to reference SSM params"
echo "  2. Set env vars for local dev:"
echo ""
echo "     export VECTOR_BUCKET_NAME=$VECTOR_BUCKET"
echo "     export VECTOR_INDEX_NAME=$VECTOR_INDEX"
echo "     export AGENTCORE_MEMORY_ID=$MEMORY_ID"
echo "     export S3_BUCKET=agentcore-docs-${ACCOUNT_ID}"
echo ""
echo "  Or source from SSM:"
echo "     eval \$(./scripts/load-ssm-env.sh)"
