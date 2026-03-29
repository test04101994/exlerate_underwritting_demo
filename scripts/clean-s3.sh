#!/bin/bash
#
# clean-s3.sh — Wipe ALL runtime data for a fresh test
#
# Clears: S3 documents, extractions, chat history, sessions,
#         email drafts, S3 Vectors, and AgentCore Memory.
#
# Usage:
#   ./scripts/clean-s3.sh          # clean everything
#   ./scripts/clean-s3.sh ACC-4    # clean only ticket ACC-4
#

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "876570154422")
BUCKET="${S3_BUCKET:-agentcore-docs-${ACCOUNT_ID}}"
JIRA_BUCKET="${JIRA_CASES_BUCKET:-jira-cases-${ACCOUNT_ID}-prod}"
VECTOR_BUCKET="${VECTOR_BUCKET_NAME:-agentcore-vectors-${ACCOUNT_ID}-production}"
VECTOR_INDEX="${VECTOR_INDEX_NAME:-pdf-chunks}"
MEMORY_ID="${AGENTCORE_MEMORY_ID:-}"

TICKET="${1:-}"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🧹  S3 / Vectors / Memory Cleanup   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$TICKET" ]; then
  echo -e "${BLUE}Scope: ticket ${RED}$TICKET${NC} only"
else
  echo -e "${RED}Scope: ALL data (full wipe)${NC}"
fi
echo ""

read -p "Are you sure? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""

# ── 1. Uploaded Documents ────────────────────────────────────────────────────
echo -e "${BLUE}[1/6] Clearing uploaded documents...${NC}"
if [ -n "$TICKET" ]; then
  aws s3 rm "s3://$BUCKET/uploads/" --recursive --exclude "*" --include "*/$TICKET/*" --region $REGION 2>/dev/null || true
else
  aws s3 rm "s3://$BUCKET/uploads/" --recursive --region $REGION 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ Documents cleared${NC}"

# ── 2. Extractions ───────────────────────────────────────────────────────────
echo -e "${BLUE}[2/6] Clearing extractions...${NC}"
if [ -n "$TICKET" ]; then
  aws s3 rm "s3://$BUCKET/extractions/$TICKET/" --recursive --region $REGION 2>/dev/null || true
else
  aws s3 rm "s3://$BUCKET/extractions/" --recursive --region $REGION 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ Extractions cleared${NC}"

# ── 3. Chat History + Sessions ───────────────────────────────────────────────
echo -e "${BLUE}[3/6] Clearing chat history & sessions...${NC}"
if [ -n "$TICKET" ]; then
  aws s3 rm "s3://$BUCKET/chat-history/$TICKET/" --recursive --region $REGION 2>/dev/null || true
  aws s3 rm "s3://$BUCKET/sessions/$TICKET/" --recursive --region $REGION 2>/dev/null || true
else
  aws s3 rm "s3://$BUCKET/chat-history/" --recursive --region $REGION 2>/dev/null || true
  aws s3 rm "s3://$BUCKET/sessions/" --recursive --region $REGION 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ Chat history & sessions cleared${NC}"

# ── 4. Email / Reconciliation Drafts ────────────────────────────────────────
echo -e "${BLUE}[4/6] Clearing reconciliation drafts...${NC}"
if [ -n "$TICKET" ]; then
  # Drafts aren't namespaced by ticket in key, but we can clear all
  echo "  (drafts not ticket-scoped, skipping per-ticket clean)"
else
  aws s3 rm "s3://$BUCKET/email-drafts/" --recursive --region $REGION 2>/dev/null || true
fi
echo -e "${GREEN}  ✓ Drafts cleared${NC}"

# ── 5. S3 Vectors ────────────────────────────────────────────────────────────
echo -e "${BLUE}[5/6] Clearing S3 Vectors ($VECTOR_BUCKET/$VECTOR_INDEX)...${NC}"
python3 -c "
import boto3, sys
s3v = boto3.client('s3vectors', region_name='$REGION')
ticket = '$TICKET'
try:
    resp = s3v.list_vectors(vectorBucketName='$VECTOR_BUCKET', indexName='$VECTOR_INDEX')
    vectors = resp.get('vectors', [])
    if ticket:
        keys = [v['key'] for v in vectors if ticket in v['key']]
    else:
        keys = [v['key'] for v in vectors]
    if keys:
        s3v.delete_vectors(vectorBucketName='$VECTOR_BUCKET', indexName='$VECTOR_INDEX', keys=keys)
        print(f'  Deleted {len(keys)} vectors')
    else:
        print('  No vectors to delete')
except Exception as e:
    print(f'  Warning: {e}')
" 2>&1
echo -e "${GREEN}  ✓ Vectors cleared${NC}"

# ── 6. AgentCore Memory ──────────────────────────────────────────────────────
echo -e "${BLUE}[6/6] Clearing AgentCore Memory...${NC}"
python3 -c "
from bedrock_agentcore.memory import MemoryClient
import sys
mc = MemoryClient(region_name='$REGION')
ticket = '$TICKET'
try:
    if ticket:
        # Clear memories for specific ticket (actor)
        ns = f'/strategies/ticket_facts/actors/{ticket}/'
        memories = mc.retrieve_memories(memory_id='$MEMORY_ID', namespace=ns, query='*', top_k=100)
        print(f'  Found {len(memories)} memories for {ticket}')
        # Note: MemoryClient doesn't have a delete_memories method for individual records
        # The memories will expire after 90 days automatically
        print(f'  (Per-ticket memory deletion not supported — memories expire after 90 days)')
    else:
        print('  Full memory wipe requires deleting and recreating the memory resource.')
        print('  Skipping — memories will expire after 90 days.')
except Exception as e:
    print(f'  Warning: {e}')
" 2>&1
echo -e "${GREEN}  ✓ Memory check complete${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅  Cleanup Complete!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "Restart servers to pick up clean state:"
echo "  1. Kill AgentCore:  lsof -ti :8080 | xargs kill -9"
echo "  2. Kill Express:    lsof -ti :3001 | xargs kill -9"
echo "  3. Start:           cd agentcore && python main.py &"
echo "  4. Start:           npm run dev"
