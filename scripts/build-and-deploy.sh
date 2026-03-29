#!/bin/bash
#
# build-and-deploy.sh — Build Docker images via CodeBuild + deploy to ECS
#
# Usage:
#   ./scripts/build-and-deploy.sh                    # build + deploy all
#   ./scripts/build-and-deploy.sh --backend-only     # backend only
#   ./scripts/build-and-deploy.sh --frontend-only    # frontend only
#   ./scripts/build-and-deploy.sh --skip-build       # just update ECS (images already in ECR)
#

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-exlerate-ai}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION")
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"

# Parse args
BUILD_BACKEND=true
BUILD_FRONTEND=true
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-only)  BUILD_FRONTEND=false; shift ;;
    --frontend-only) BUILD_BACKEND=false; shift ;;
    --skip-build)    SKIP_BUILD=true; shift ;;
    --region)        REGION="$2"; shift 2 ;;
    --stack)         STACK_NAME="$2"; shift 2 ;;
    --tag)           IMAGE_TAG="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🚀  Build & Deploy to ECS                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Account:  ${GREEN}${ACCOUNT_ID}${NC}"
echo -e "  Region:   ${GREEN}${REGION}${NC}"
echo -e "  Stack:    ${GREEN}${STACK_NAME}${NC}"
echo -e "  Tag:      ${GREEN}${IMAGE_TAG}${NC}"
echo ""

# ── Get stack outputs ────────────────────────────────────────────────────────

echo -e "${BLUE}[1/6] Reading stack outputs...${NC}"
get_output() {
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null
}

BACKEND_ECR=$(get_output BackendECRRepository)
FRONTEND_ECR=$(get_output FrontendECRRepository)
CB_BUCKET=$(get_output CodeBuildSourceBucketName)
BACKEND_BUILD_PROJECT=$(get_output BackendBuildProjectName)
FRONTEND_BUILD_PROJECT=$(get_output FrontendBuildProjectName)
ECS_CLUSTER=$(get_output ECSClusterName)
ALB_DNS=$(get_output ALBDnsName)

echo -e "  Backend ECR:  ${GREEN}${BACKEND_ECR}${NC}"
echo -e "  Frontend ECR: ${GREEN}${FRONTEND_ECR}${NC}"
echo -e "  ECS Cluster:  ${GREEN}${ECS_CLUSTER}${NC}"
echo ""

if [ "$SKIP_BUILD" = true ]; then
  echo -e "${YELLOW}Skipping build — using latest images in ECR${NC}"
else

  # ── Zip & upload source ──────────────────────────────────────────────────

  echo -e "${BLUE}[2/6] Packaging source code...${NC}"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
  TMPZIP="/tmp/source-${IMAGE_TAG}.zip"

  cd "$PROJECT_DIR"
  zip -qr "$TMPZIP" . \
    -x "node_modules/*" ".venv/*" "__pycache__/*" "dist/*" ".git/*" ".claude/*" "*.pyc" ".DS_Store"
  echo -e "  ${GREEN}✓ Zipped ($(du -h "$TMPZIP" | cut -f1))${NC}"

  echo -e "${BLUE}[3/6] Uploading to S3...${NC}"
  aws s3 cp "$TMPZIP" "s3://${CB_BUCKET}/source.zip" --region "$REGION" --quiet
  rm -f "$TMPZIP"
  echo -e "  ${GREEN}✓ Uploaded to s3://${CB_BUCKET}/source.zip${NC}"

  # ── Start CodeBuild ──────────────────────────────────────────────────────

  echo -e "${BLUE}[4/6] Starting CodeBuild...${NC}"

  BACKEND_BUILD_ID=""
  FRONTEND_BUILD_ID=""

  if [ "$BUILD_BACKEND" = true ]; then
    BACKEND_BUILD_ID=$(aws codebuild start-build \
      --project-name "$BACKEND_BUILD_PROJECT" \
      --region "$REGION" \
      --environment-variables-override "name=IMAGE_TAG,value=${IMAGE_TAG}" \
      --query 'build.id' --output text)
    echo -e "  ${GREEN}✓ Backend build: ${BACKEND_BUILD_ID}${NC}"
  fi

  if [ "$BUILD_FRONTEND" = true ]; then
    FRONTEND_BUILD_ID=$(aws codebuild start-build \
      --project-name "$FRONTEND_BUILD_PROJECT" \
      --region "$REGION" \
      --environment-variables-override "name=IMAGE_TAG,value=${IMAGE_TAG}" \
      --query 'build.id' --output text)
    echo -e "  ${GREEN}✓ Frontend build: ${FRONTEND_BUILD_ID}${NC}"
  fi

  # ── Wait for builds ────────────────────────────────────────────────────

  echo -e "${BLUE}[5/6] Waiting for builds to complete...${NC}"

  wait_for_build() {
    local build_id="$1"
    local name="$2"
    while true; do
      STATUS=$(aws codebuild batch-get-builds --ids "$build_id" --region "$REGION" \
        --query 'builds[0].buildStatus' --output text)
      if [ "$STATUS" = "SUCCEEDED" ]; then
        echo -e "  ${GREEN}✓ ${name} build SUCCEEDED${NC}"
        return 0
      elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "FAULT" ] || [ "$STATUS" = "TIMED_OUT" ] || [ "$STATUS" = "STOPPED" ]; then
        echo -e "  ${RED}✗ ${name} build ${STATUS}${NC}"
        echo "  Check logs: aws codebuild batch-get-builds --ids $build_id --region $REGION"
        return 1
      fi
      printf "  ⏳ ${name}: ${STATUS}...\r"
      sleep 15
    done
  }

  FAILED=false

  if [ -n "$BACKEND_BUILD_ID" ]; then
    wait_for_build "$BACKEND_BUILD_ID" "Backend" || FAILED=true
  fi

  if [ -n "$FRONTEND_BUILD_ID" ]; then
    wait_for_build "$FRONTEND_BUILD_ID" "Frontend" || FAILED=true
  fi

  if [ "$FAILED" = true ]; then
    echo -e "${RED}One or more builds failed. Aborting deploy.${NC}"
    exit 1
  fi

fi  # end skip-build check

# ── Update CloudFormation with real ECR images ─────────────────────────────

echo -e "${BLUE}[6/7] Updating CloudFormation with ECR images...${NC}"

BACKEND_IMAGE_URI="${BACKEND_ECR}:${IMAGE_TAG}"
FRONTEND_IMAGE_URI="${FRONTEND_ECR}:${IMAGE_TAG}"

# If skip-build, use latest tag
if [ "$SKIP_BUILD" = true ]; then
  BACKEND_IMAGE_URI="${BACKEND_ECR}:latest"
  FRONTEND_IMAGE_URI="${FRONTEND_ECR}:latest"
fi

echo -e "  Backend:  ${GREEN}${BACKEND_IMAGE_URI}${NC}"
echo -e "  Frontend: ${GREEN}${FRONTEND_IMAGE_URI}${NC}"

# Read existing params and rebuild with new images
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PARAMS_FILE="${PROJECT_DIR}/infrastructure/params.json"

# Get current stack parameters to preserve them
EXISTING_PARAMS=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" \
  --query 'Stacks[0].Parameters[*]' --output json 2>/dev/null || echo "[]")

# Get bucket names from current stack
DOC_BUCKET=$(echo "$EXISTING_PARAMS" | python3 -c "import json,sys; params={p['ParameterKey']:p.get('ParameterValue','') for p in json.load(sys.stdin)}; print(params.get('DocumentsBucketName','agentcore-docs-${ACCOUNT_ID}'))" 2>/dev/null || echo "agentcore-docs-${ACCOUNT_ID}")
JIRA_BUCKET=$(echo "$EXISTING_PARAMS" | python3 -c "import json,sys; params={p['ParameterKey']:p.get('ParameterValue','') for p in json.load(sys.stdin)}; print(params.get('JiraCasesBucketName','jira-cases-${ACCOUNT_ID}-prod'))" 2>/dev/null || echo "jira-cases-${ACCOUNT_ID}-prod")

# Build parameter overrides from params.json + image URIs
PARAM_OVERRIDES=$(python3 -c "
import json
with open('$PARAMS_FILE') as f:
    params = json.load(f)
overrides = [f\"{p['ParameterKey']}={p['ParameterValue']}\" for p in params if p.get('ParameterValue')]
print(' '.join(overrides))
" 2>/dev/null || echo "")

aws cloudformation deploy \
  --template-file "${PROJECT_DIR}/infrastructure/cloudformation.yaml" \
  --stack-name "$STACK_NAME" \
  --parameter-overrides \
    $PARAM_OVERRIDES \
    BackendImage="$BACKEND_IMAGE_URI" \
    FrontendImage="$FRONTEND_IMAGE_URI" \
    DocumentsBucketName="$DOC_BUCKET" \
    JiraCasesBucketName="$JIRA_BUCKET" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "$REGION" \
  --no-fail-on-empty-changeset 2>&1 | tail -1

echo -e "  ${GREEN}✓ Stack updated with new images${NC}"

# ── Update ECS services ────────────────────────────────────────────────────

echo -e "${BLUE}[7/7] Scaling ECS services...${NC}"

ENV_NAME=$(echo "$EXISTING_PARAMS" | python3 -c "import json,sys; params={p['ParameterKey']:p.get('ParameterValue','') for p in json.load(sys.stdin)}; print(params.get('EnvironmentName','production'))" 2>/dev/null || echo "production")

BACKEND_SERVICE="${ENV_NAME}-backend"
FRONTEND_SERVICE="${ENV_NAME}-frontend"

# Force new deployment + scale to 1
if [ "$BUILD_BACKEND" = true ]; then
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$BACKEND_SERVICE" \
    --desired-count 1 \
    --force-new-deployment \
    --region "$REGION" \
    --output text --query 'service.serviceName' > /dev/null 2>&1
  echo -e "  ${GREEN}✓ Backend service updated (desired: 1)${NC}"
fi

if [ "$BUILD_FRONTEND" = true ]; then
  aws ecs update-service \
    --cluster "$ECS_CLUSTER" \
    --service "$FRONTEND_SERVICE" \
    --desired-count 1 \
    --force-new-deployment \
    --region "$REGION" \
    --output text --query 'service.serviceName' > /dev/null 2>&1
  echo -e "  ${GREEN}✓ Frontend service updated (desired: 1)${NC}"
fi

# Wait for services to stabilize
echo ""
echo -e "${YELLOW}Waiting for ECS services to stabilize (~1-2 min)...${NC}"
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$BACKEND_SERVICE" "$FRONTEND_SERVICE" \
  --region "$REGION" 2>&1 && echo -e "  ${GREEN}✓ Services stable${NC}" || echo -e "  ${YELLOW}⚠ Timeout — services still deploying${NC}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅  Deploy Complete!                 ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ALB:        ${GREEN}${ALB_DNS}${NC}"
echo -e "  CloudFront: ${GREEN}$(get_output CloudFrontDomainName)${NC}"
echo ""
echo "  ECS services will take ~1-2 min to stabilize."
echo "  Monitor: aws ecs describe-services --cluster $ECS_CLUSTER --services $BACKEND_SERVICE $FRONTEND_SERVICE --region $REGION --query 'services[*].[serviceName,runningCount,desiredCount]' --output table"
