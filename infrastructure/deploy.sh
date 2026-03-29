#!/bin/bash
set -euo pipefail

# ============================================================
# EXLerate AI - AWS Deployment Script (No local Docker needed)
# ============================================================
# Uses AWS CodeBuild to build Docker images in the cloud.
#
# Usage:
#   ./infrastructure/deploy.sh                    # Full deploy
#   ./infrastructure/deploy.sh --skip-build       # Deploy without rebuilding images
#   ./infrastructure/deploy.sh --infra-only       # Deploy CloudFormation stack only
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
STACK_NAME="${STACK_NAME:-exlerate-ai}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
PARAMS_FILE="${PARAMS_FILE:-$SCRIPT_DIR/params.json}"

# Derived values
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_BASE}/exlerate-ai/backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_BASE}/exlerate-ai/frontend:${IMAGE_TAG}"
AGENTCORE_IMAGE="${ECR_BASE}/exlerate-ai/agentcore:${IMAGE_TAG}"

# Parse flags
SKIP_BUILD=false
INFRA_ONLY=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --infra-only) INFRA_ONLY=true ;;
  esac
done

echo "============================================"
echo "  EXLerate AI - AWS Deployment"
echo "============================================"
echo "  Stack:       $STACK_NAME"
echo "  Region:      $AWS_REGION"
echo "  Environment: $ENVIRONMENT"
echo "  Image Tag:   $IMAGE_TAG"
echo "  Account:     $AWS_ACCOUNT_ID"
echo "============================================"

# ----------------------------------------------------------
# Helper: Build parameter overrides from params.json
# ----------------------------------------------------------
get_param_overrides() {
  if [ -f "$PARAMS_FILE" ]; then
    python3 -c "
import json
with open('$PARAMS_FILE') as f:
    params = json.load(f)
overrides = []
for p in params:
    overrides.append(f\"{p['ParameterKey']}={p['ParameterValue']}\")
print(' '.join(overrides))
"
  else
    echo "ERROR: Parameters file not found: $PARAMS_FILE" >&2
    echo "Copy infrastructure/params.json.template to infrastructure/params.json and fill in your values." >&2
    exit 1
  fi
}

# ----------------------------------------------------------
# Helper: Wait for CodeBuild to finish
# ----------------------------------------------------------
wait_for_build() {
  local build_id=$1
  local project_name=$2
  echo "  Waiting for $project_name build ($build_id)..."

  while true; do
    STATUS=$(aws codebuild batch-get-builds \
      --ids "$build_id" \
      --region "$AWS_REGION" \
      --query "builds[0].buildStatus" \
      --output text)

    case $STATUS in
      SUCCEEDED)
        echo "  $project_name build SUCCEEDED"
        return 0
        ;;
      FAILED|FAULT|STOPPED|TIMED_OUT)
        echo "  ERROR: $project_name build $STATUS"
        echo "  View logs: aws codebuild batch-get-builds --ids $build_id --region $AWS_REGION"
        return 1
        ;;
      IN_PROGRESS)
        printf "."
        sleep 10
        ;;
    esac
  done
}

  # ----------------------------------------------------------
  # Step 1: Deploy CloudFormation stack (infra + CodeBuild)
  # ----------------------------------------------------------
  echo ""
  echo ">> Step 1: Deploying CloudFormation stack..."

  PARAM_OVERRIDES=$(get_param_overrides)

  # For first deploy, use a placeholder image. CodeBuild will push the real one.
  # Check if stack exists already
  STACK_EXISTS=true
  aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$AWS_REGION" &>/dev/null || STACK_EXISTS=false

  if [ "$STACK_EXISTS" = false ]; then
    echo "  First-time deploy - creating stack with placeholder images..."
    echo "  (ECS services will start after CodeBuild pushes real images)"
    DEPLOY_BACKEND_IMAGE="$BACKEND_IMAGE"
    DEPLOY_FRONTEND_IMAGE="$FRONTEND_IMAGE"
    DEPLOY_AGENTCORE_IMAGE="$AGENTCORE_IMAGE"
  else
    # Stack exists - reuse CURRENT image tags for this infra-only step.
    # This avoids ECS trying to deploy non-existent images before CodeBuild runs.
    # We'll update to the new images in Step 5 after CodeBuild finishes.
    CURRENT_BACKEND=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" --region "$AWS_REGION" \
      --query "Stacks[0].Parameters[?ParameterKey=='BackendImage'].ParameterValue" \
      --output text 2>/dev/null || echo "$BACKEND_IMAGE")
    CURRENT_FRONTEND=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" --region "$AWS_REGION" \
      --query "Stacks[0].Parameters[?ParameterKey=='FrontendImage'].ParameterValue" \
      --output text 2>/dev/null || echo "$FRONTEND_IMAGE")
    CURRENT_AGENTCORE=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" --region "$AWS_REGION" \
      --query "Stacks[0].Parameters[?ParameterKey=='AgentCoreImage'].ParameterValue" \
      --output text 2>/dev/null || echo "")
    # For new parameters that don't exist yet, use the target image tag
    # (the image won't exist, but DesiredCount=0 means ECS won't try to pull it)
    if [ -z "$CURRENT_AGENTCORE" ] || [ "$CURRENT_AGENTCORE" = "None" ]; then
      CURRENT_AGENTCORE="$AGENTCORE_IMAGE"
    fi
    DEPLOY_BACKEND_IMAGE="$CURRENT_BACKEND"
    DEPLOY_FRONTEND_IMAGE="$CURRENT_FRONTEND"
    DEPLOY_AGENTCORE_IMAGE="$CURRENT_AGENTCORE"
    echo "  Using current images for infra step (new images built in Step 3)"
  fi

  # Resolve S3 bucket for large templates (>51,200 bytes)
  CFN_S3_BUCKET=""
  if [ "$STACK_EXISTS" = true ]; then
    CFN_S3_BUCKET=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='CodeBuildSourceBucketName'].OutputValue" \
      --output text 2>/dev/null || true)
  fi
  S3_BUCKET_FLAG=""
  if [ -n "$CFN_S3_BUCKET" ]; then
    S3_BUCKET_FLAG="--s3-bucket $CFN_S3_BUCKET --s3-prefix cfn-templates"
    echo "  Using S3 bucket for template: $CFN_S3_BUCKET"
  fi

  aws cloudformation deploy \
    --template-file "$SCRIPT_DIR/cloudformation.yaml" \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    $S3_BUCKET_FLAG \
    --parameter-overrides \
      EnvironmentName="$ENVIRONMENT" \
      BackendImage="$DEPLOY_BACKEND_IMAGE" \
      FrontendImage="$DEPLOY_FRONTEND_IMAGE" \
      AgentCoreImage="$DEPLOY_AGENTCORE_IMAGE" \
      $PARAM_OVERRIDES \
    --tags \
      Environment="$ENVIRONMENT" \
      Application=exlerate-ai

  echo "  Stack deployment complete."

  if [ "$INFRA_ONLY" = true ]; then
    echo ""
    echo ">> Infrastructure deployed (--infra-only). Skipping build."
    aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" \
      --output table
    exit 0
  fi

  # ----------------------------------------------------------
  # Step 2: Upload source code to S3 for CodeBuild
  # ----------------------------------------------------------
  if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo ">> Step 2: Uploading source code to S3..."

    SOURCE_BUCKET=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='CodeBuildSourceBucketName'].OutputValue" \
      --output text)

    # Create a zip of the project source
    ZIPFILE="/tmp/exlerate-source-${IMAGE_TAG}.zip"
    echo "  Creating source archive..."
    (cd "$PROJECT_DIR" && zip -r "$ZIPFILE" . \
      -x ".git/*" "node_modules/*" "dist/*" ".claude/*" "*.zip" \
      > /dev/null 2>&1)

    echo "  Uploading to s3://$SOURCE_BUCKET/source.zip ..."
    aws s3 cp "$ZIPFILE" "s3://$SOURCE_BUCKET/source.zip" --region "$AWS_REGION"
    rm -f "$ZIPFILE"

    # ----------------------------------------------------------
    # Step 3: Trigger CodeBuild for backend and frontend
    # ----------------------------------------------------------
    echo ""
    echo ">> Step 3: Starting CodeBuild builds..."

    BACKEND_PROJECT=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='BackendBuildProjectName'].OutputValue" \
      --output text)

    FRONTEND_PROJECT=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='FrontendBuildProjectName'].OutputValue" \
      --output text)

    AGENTCORE_PROJECT=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='AgentCoreBuildProjectName'].OutputValue" \
      --output text)

    # Start all builds in parallel
    BACKEND_BUILD_ID=$(aws codebuild start-build \
      --project-name "$BACKEND_PROJECT" \
      --region "$AWS_REGION" \
      --environment-variables-override "name=IMAGE_TAG,value=$IMAGE_TAG,type=PLAINTEXT" \
      --query "build.id" \
      --output text)
    echo "  Backend build started:  $BACKEND_BUILD_ID"

    FRONTEND_BUILD_ID=$(aws codebuild start-build \
      --project-name "$FRONTEND_PROJECT" \
      --region "$AWS_REGION" \
      --environment-variables-override "name=IMAGE_TAG,value=$IMAGE_TAG,type=PLAINTEXT" \
      --query "build.id" \
      --output text)
    echo "  Frontend build started: $FRONTEND_BUILD_ID"

    AGENTCORE_BUILD_ID=$(aws codebuild start-build \
      --project-name "$AGENTCORE_PROJECT" \
      --region "$AWS_REGION" \
      --environment-variables-override "name=IMAGE_TAG,value=$IMAGE_TAG,type=PLAINTEXT" \
      --query "build.id" \
      --output text)
    echo "  AgentCore build started: $AGENTCORE_BUILD_ID"

    # ----------------------------------------------------------
    # Step 4: Wait for all builds to complete
    # ----------------------------------------------------------
    echo ""
    echo ">> Step 4: Waiting for builds to complete..."
    wait_for_build "$BACKEND_BUILD_ID" "Backend"
    wait_for_build "$FRONTEND_BUILD_ID" "Frontend"
    wait_for_build "$AGENTCORE_BUILD_ID" "AgentCore"

    # ----------------------------------------------------------
    # Step 5: Update ECS services with new images
    # ----------------------------------------------------------
    echo ""
    echo ">> Step 5: Updating ECS services with new images..."

    CLUSTER_NAME=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --query "Stacks[0].Outputs[?OutputKey=='ECSClusterName'].OutputValue" \
      --output text)

    # Register new task definitions with the real image URIs, then update services
    aws cloudformation deploy \
      --template-file "$SCRIPT_DIR/cloudformation.yaml" \
      --stack-name "$STACK_NAME" \
      --region "$AWS_REGION" \
      --capabilities CAPABILITY_NAMED_IAM \
      --parameter-overrides \
        EnvironmentName="$ENVIRONMENT" \
        BackendImage="$BACKEND_IMAGE" \
        FrontendImage="$FRONTEND_IMAGE" \
        $PARAM_OVERRIDES \
      --tags \
        Environment="$ENVIRONMENT" \
        Application=exlerate-ai

    # Scale services up to 1 (template has DesiredCount: 0 for initial deploy)
    echo "  Scaling ECS services to 1 task each..."
    aws ecs update-service \
      --cluster "$CLUSTER_NAME" \
      --service "${ENVIRONMENT}-backend" \
      --desired-count 1 \
      --region "$AWS_REGION" > /dev/null

    aws ecs update-service \
      --cluster "$CLUSTER_NAME" \
      --service "${ENVIRONMENT}-frontend" \
      --desired-count 1 \
      --region "$AWS_REGION" > /dev/null

    aws ecs update-service \
      --cluster "$CLUSTER_NAME" \
      --service "${ENVIRONMENT}-agentcore" \
      --desired-count 1 \
      --region "$AWS_REGION" > /dev/null

    echo "  ECS services updated and scaled to 1."
  else
    echo ""
    echo ">> Steps 2-5: Skipped (--skip-build)"
  fi

# ----------------------------------------------------------
# Step 6: Output results
# ----------------------------------------------------------
echo ""
echo "============================================"
echo "  Deployment Complete!"
echo "============================================"

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[*].[OutputKey,OutputValue]" \
  --output table

echo ""
echo "Note: CloudFront may take 10-15 minutes to fully propagate."
echo "Use the ALB URL for immediate testing."
