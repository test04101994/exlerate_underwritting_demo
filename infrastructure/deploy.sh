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
#   ./infrastructure/deploy.sh --migrate-only     # Run DB migrations only
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

# Parse flags
SKIP_BUILD=false
MIGRATE_ONLY=false
INFRA_ONLY=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --migrate-only) MIGRATE_ONLY=true ;;
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

# ===========================================================
# MIGRATE ONLY - skip everything else
# ===========================================================
if [ "$MIGRATE_ONLY" = true ]; then
  echo ""
  echo ">> Running database migrations only..."
  # (migration logic at bottom)
fi

if [ "$MIGRATE_ONLY" = false ]; then

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
    # Use a known public image as placeholder - ECS will fail healthcheck but that's ok
    DEPLOY_BACKEND_IMAGE="$BACKEND_IMAGE"
    DEPLOY_FRONTEND_IMAGE="$FRONTEND_IMAGE"
  else
    # Stack exists - use the new image tag
    DEPLOY_BACKEND_IMAGE="$BACKEND_IMAGE"
    DEPLOY_FRONTEND_IMAGE="$FRONTEND_IMAGE"
  fi

  aws cloudformation deploy \
    --template-file "$SCRIPT_DIR/cloudformation.yaml" \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
      EnvironmentName="$ENVIRONMENT" \
      BackendImage="$DEPLOY_BACKEND_IMAGE" \
      FrontendImage="$DEPLOY_FRONTEND_IMAGE" \
      $PARAM_OVERRIDES \
    --tags \
      Environment="$ENVIRONMENT" \
      Application=exlerate-ai

  echo "  Stack deployment complete."

  if [ "$INFRA_ONLY" = true ]; then
    echo ""
    echo ">> Infrastructure deployed (--infra-only). Skipping build and migration."
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

    # Start both builds in parallel
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

    # ----------------------------------------------------------
    # Step 4: Wait for both builds to complete
    # ----------------------------------------------------------
    echo ""
    echo ">> Step 4: Waiting for builds to complete..."
    wait_for_build "$BACKEND_BUILD_ID" "Backend"
    wait_for_build "$FRONTEND_BUILD_ID" "Frontend"

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

    echo "  ECS services updated and scaled to 1."
  else
    echo ""
    echo ">> Steps 2-5: Skipped (--skip-build)"
  fi
fi

# ----------------------------------------------------------
# Step 6: Run database migrations
# ----------------------------------------------------------
echo ""
echo ">> Step 6: Running database migrations..."

CLUSTER_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ECSClusterName'].OutputValue" \
  --output text)

TASK_DEF_ARN=$(aws ecs describe-services \
  --cluster "$CLUSTER_NAME" \
  --services "${ENVIRONMENT}-backend" \
  --region "$AWS_REGION" \
  --query "services[0].taskDefinition" \
  --output text)

NETWORK_CONFIG=$(aws ecs describe-services \
  --cluster "$CLUSTER_NAME" \
  --services "${ENVIRONMENT}-backend" \
  --region "$AWS_REGION" \
  --query "services[0].networkConfiguration" \
  --output json)

SUBNETS=$(echo "$NETWORK_CONFIG" | python3 -c "import sys,json; nc=json.load(sys.stdin); print(','.join(nc['awsvpcConfiguration']['subnets']))")
SECURITY_GROUPS=$(echo "$NETWORK_CONFIG" | python3 -c "import sys,json; nc=json.load(sys.stdin); print(','.join(nc['awsvpcConfiguration']['securityGroups']))")

echo "  Running migration task..."
TASK_ARN=$(aws ecs run-task \
  --cluster "$CLUSTER_NAME" \
  --task-definition "$TASK_DEF_ARN" \
  --launch-type FARGATE \
  --region "$AWS_REGION" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUPS],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "backend",
      "command": ["npx", "drizzle-kit", "push"]
    }]
  }' \
  --query "tasks[0].taskArn" \
  --output text)

echo "  Migration task started: $TASK_ARN"
echo "  Waiting for migration to complete..."

aws ecs wait tasks-stopped \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --region "$AWS_REGION"

EXIT_CODE=$(aws ecs describe-tasks \
  --cluster "$CLUSTER_NAME" \
  --tasks "$TASK_ARN" \
  --region "$AWS_REGION" \
  --query "tasks[0].containers[0].exitCode" \
  --output text)

if [ "$EXIT_CODE" = "0" ]; then
  echo "  Database migration completed successfully."
else
  echo "  WARNING: Migration task exited with code $EXIT_CODE"
  echo "  Check CloudWatch logs for details."
fi

# ----------------------------------------------------------
# Step 7: Output results
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
