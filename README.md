# EXL Underwriting Platform — AI-Powered Agent Hub

Multi-agent orchestration platform for insurance underwriting, powered by AWS Bedrock AgentCore, Strands Agents SDK, and LangGraph.

---

## Architecture

```
                         +---------------------+
                         |    CloudFront CDN    |
                         |      (HTTPS)         |
                         +----------+-----------+
                                    |
                         +----------v-----------+
                         |   ALB (HTTP :80)      |
                         |   Route-based rules   |
                         +--+--------+--------+--+
                            |        |        |
                  /api/*    |  /ws   |  /*    |
                            |        |        |
               +------------v+ +-----v------+ +v------------+
               |  Backend    | |  AgentCore  | |  Frontend   |
               |  ECS Task   | |  ECS Task   | |  ECS Task   |
               |             | |             | |             |
               | Express:3001| | WS:8080     | | Nginx:80    |
               |   | proxy   | | Strands SDK | | React SPA   |
               | FastAPI:8000| | LangGraph   | |             |
               +------+------+ +------+------+ +-------------+
                      |               |
            +---------v---------------v------------+
            |              AWS Services            |
            |                                      |
            |  S3 (documents, extractions, chat)   |
            |  S3 Vectors (PDF embeddings)         |
            |  Bedrock (Nova Lite, Titan Embed)    |
            |  AgentCore Memory (long-term)        |
            |  SSM Parameter Store (config)        |
            +--------------------------------------+
```

### Key Design Decisions

- **ECS Fargate** (not EC2): No instance management, per-second billing, auto-scaling to zero
- **All 3 services scale to 0** after 1 hour of inactivity — zero compute cost when idle
- **CloudFront caches frontend** — serves the SPA even when ECS is scaled down
- **ALB health checks + CloudWatch alarms** trigger scale-up on first request (~30-60s cold start)
- **CodeBuild** builds Docker images in AWS — no local Docker required

---

## Project Structure

```
+-- client/                  <- FRONTEND (React + Vite + Tailwind)
|   +-- src/
|   |   +-- pages/           (dashboard, agent-testing, data-validation, login)
|   |   +-- hooks/           (use-agent-websocket - WS client)
|   |   +-- components/      (shadcn UI + custom)
|   +-- public/
|
+-- server/                  <- EXPRESS PROXY (3 files)
|   +-- index.ts             (proxy /api/* -> Python :8000, serve Vite)
|   +-- routes.ts            (Socket.IO stub)
|   +-- vite.ts              (Vite dev middleware)
|
+-- api/                     <- BACKEND API (Python FastAPI)
|   +-- main.py              (FastAPI app + CORS + session)
|   +-- routers/
|   |   +-- auth.py          (login, logout, ws-token)
|   |   +-- data.py          (upload, documents, extractions, sessions)
|   |   +-- jira.py          (dashboard tasks from S3, config)
|   |   +-- credentials.py   (validate, get/update credentials)
|   +-- s3_helpers.py        (shared boto3 S3 client)
|   +-- lambda/              (AWS Lambda handlers)
|
+-- agentcore/               <- AGENT RUNTIME (Strands SDK + Bedrock)
|   +-- main.py              (WS handler, orchestrator, planner)
|   +-- settings.py          (config from env/SSM)
|   +-- data_extraction.py   (LangGraph: PDF -> structured fields)
|   +-- jira_comment_draft.py (LangGraph: reconciliation drafts)
|   +-- tools/               (calculator, doc_analysis, jira, etc.)
|   +-- Dockerfile
|   +-- requirements.txt
|
+-- config/
|   +-- credentials.json     (AWS + Jira credentials for local dev)
|
+-- scripts/
|   +-- setup-resources.sh   (create S3 Vectors + Memory + SSM params)
|   +-- build-and-deploy.sh  (build images + deploy to ECS)
|   +-- load-ssm-env.sh      (load SSM params into env vars)
|   +-- clean-s3.sh          (wipe all runtime data for fresh testing)
|
+-- infrastructure/          <- DEPLOYMENT
|   +-- cloudformation.yaml  (VPC, ECS, ALB, S3, IAM, CloudFront)
|   +-- deploy.sh            (full deploy orchestrator)
|   +-- Dockerfile.backend   (Express + Python API)
|   +-- Dockerfile.frontend  (Nginx + React SPA)
|   +-- buildspec-*.yml      (CodeBuild specs for backend, frontend, agentcore)
|   +-- nginx*.conf          (Nginx configurations)
|   +-- params.json.template (CloudFormation parameters template)
|   +-- docker-compose.yml   (local multi-service setup)
+-- package.json
```

---

## Local Development

### Prerequisites

| Tool | Version | Verify |
|------|---------|--------|
| Node.js | 20+ | `node --version` |
| Python | 3.12+ | `python3 --version` |
| AWS CLI | v2 | `aws --version` |
| AWS credentials | configured | `aws sts get-caller-identity` |

### Install

```bash
# Node dependencies
npm install

# Python venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r api/requirements.txt
pip install -r agentcore/requirements.txt
```

### Configure

Edit `config/credentials.json`:
```json
{
  "aws": {
    "access_key_id": "YOUR_KEY",
    "secret_access_key": "YOUR_SECRET",
    "region": "us-east-1",
    "services": { "s3": { "bucket_name": "agentcore-docs-YOUR_ACCOUNT_ID" } }
  },
  "jira": {
    "base_url": "https://YOUR_DOMAIN.atlassian.net",
    "api_token": "YOUR_JIRA_TOKEN",
    "email": "your@email.com",
    "project_key": "ACC"
  }
}
```

### Run

```bash
# Terminal 1: Express + Python API (ports 3001 + 8000)
npm run dev

# Terminal 2: AgentCore WebSocket (port 8080)
source .venv/bin/activate
cd agentcore && python main.py

# Open browser
open http://localhost:3001
```

Login: `admin@exl.com` / `admin123`

---

## AWS Deployment — Fresh Account (Complete Guide)

Follow these steps **in exact order** when deploying to a new AWS account.

### Prerequisites

| Requirement | How to verify |
|-------------|--------------|
| AWS CLI v2 | `aws --version` |
| AWS credentials with admin access | `aws sts get-caller-identity` |
| Python 3.12+ with pip | `python3 --version && pip3 --version` |
| Bedrock model access enabled | AWS Console -> Bedrock -> Model access -> Enable **Nova Lite** + **Titan Embed v2** |
| Region | Must use `us-east-1` (Bedrock + S3 Vectors availability) |

### Step 1: Set Environment Variables

```bash
export AWS_REGION=us-east-1
export ENVIRONMENT=production
export STACK_NAME=exlerate-ai
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "Deploying to account: $ACCOUNT_ID in $AWS_REGION"
```

### Step 2: Create S3 Buckets

```bash
# Documents bucket (uploads, extractions, chat history, sessions, drafts)
aws s3api create-bucket \
  --bucket agentcore-docs-${ACCOUNT_ID} \
  --region $AWS_REGION

# Jira dashboard cases bucket
aws s3api create-bucket \
  --bucket jira-cases-${ACCOUNT_ID}-prod \
  --region $AWS_REGION

# Seed empty dashboard data
echo '[]' | aws s3 cp - s3://jira-cases-${ACCOUNT_ID}-prod/dashboard/all-cases.json \
  --content-type application/json --region $AWS_REGION
```

### Step 3: Create S3 Vectors + AgentCore Memory + SSM Parameters

```bash
# Install bedrock-agentcore SDK (needed for memory creation)
pip3 install bedrock-agentcore

# Run setup script
./scripts/setup-resources.sh --env $ENVIRONMENT --region $AWS_REGION
```

This creates:
- S3 Vectors bucket + index (1024 dimensions, cosine similarity for PDF embeddings)
- AgentCore Memory resource (long-term conversation memory)
- SSM Parameters at `/agentcore/production/*`

Verify:
```bash
aws ssm get-parameters-by-path \
  --path /agentcore/$ENVIRONMENT \
  --recursive --region $AWS_REGION \
  --query 'Parameters[].[Name,Value]' --output table
```

### Step 4: Configure Stack Parameters

```bash
cp infrastructure/params.json.template infrastructure/params.json
```

Edit `infrastructure/params.json` with your values:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `SessionSecret` | Random 32+ char string for session encryption | `xK9m2Qp7vL4wR8nT3jF6hB0sY5dA1eC` |
| `JiraBaseURL` | Your Jira Cloud instance URL | `https://yourorg.atlassian.net` |
| `JiraEmail` | Jira account email | `user@company.com` |
| `JiraAPIToken` | Jira API token ([create here](https://id.atlassian.com/manage-profile/security/api-tokens)) | `ATATT3xFf...` |
| `JiraDefaultProject` | Default Jira project key | `ACC` |
| `SESFromEmail` | SES verified sender email (optional) | `noreply@company.com` |
| `SESDefaultRecipient` | Default email recipient (optional) | `team@company.com` |

### Step 5: Deploy Infrastructure (CloudFormation)

```bash
./infrastructure/deploy.sh --infra-only
```

This creates (~10-15 minutes):
- VPC + 4 subnets (2 public, 2 private) + NAT Gateway
- Application Load Balancer with path-based routing
- ECS Fargate Cluster + 3 services (backend, frontend, agentcore)
- 3 ECR repositories + 3 CodeBuild projects
- CloudFront CDN distribution
- CloudWatch alarms for auto-scaling (scale-to-zero)
- IAM roles (ECS execution, task, Bedrock access)
- CloudWatch log groups

Verify:
```bash
aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --region $AWS_REGION \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' --output table
```

### Step 6: Apply IAM Bucket Policy

The ECS tasks need S3/Bedrock/Vectors access. Get the policy from stack outputs:

```bash
# Get the required IAM policy
aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`RequiredBucketPolicies`].OutputValue' \
  --output text --region $AWS_REGION > /tmp/bucket-policy.json

# Attach to your IAM user or role
aws iam put-user-policy \
  --user-name YOUR_IAM_USER \
  --policy-name AgentCoreBucketAccess \
  --policy-document file:///tmp/bucket-policy.json
```

### Step 7: Build & Deploy Application

```bash
./infrastructure/deploy.sh
```

This takes ~8-12 minutes:
1. Uploads source code to S3 (for CodeBuild)
2. Triggers 3 parallel CodeBuild builds (backend, frontend, agentcore)
3. Pushes Docker images to ECR
4. Updates ECS task definitions with new image URIs
5. Scales all ECS services to 1

### Step 8: Verify Deployment

```bash
# Get URLs
ALB=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDnsName`].OutputValue' \
  --output text --region $AWS_REGION)

CF=$(aws cloudformation describe-stacks --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' \
  --output text --region $AWS_REGION)

echo "ALB:        $ALB"
echo "CloudFront: $CF"

# Verify backend health
curl $ALB/health

# Verify AgentCore agents
curl $ALB/agents

# Open in browser (CloudFront may take 5-10 min to propagate)
open $CF
```

Login: `admin@exl.com` / `admin123`

### Step 9: (Optional) Jira Webhook

For real-time Jira event notifications:
1. Jira Settings -> System -> Webhooks
2. URL: `https://{CLOUDFRONT_DOMAIN}/webhook/jira`
3. Events: Issue updated, Comment created

---

## Subsequent Deployments (Code Changes Only)

After the initial setup, deploy code changes with:

```bash
# Full rebuild + deploy (all 3 services)
./infrastructure/deploy.sh

# Or use build-and-deploy.sh for more control:
./scripts/build-and-deploy.sh                # All services
./scripts/build-and-deploy.sh --backend-only # Backend only
./scripts/build-and-deploy.sh --frontend-only # Frontend only
./scripts/build-and-deploy.sh --skip-build   # Deploy existing images

# CloudFront cache invalidation (if frontend changed)
CF_ID=$(aws cloudformation describe-stacks --stack-name exlerate-ai \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text --region us-east-1)
aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
```

---

## Deploying to a Different AWS Account

To deploy this stack to another AWS account:

```bash
# 1. Configure AWS CLI for the new account
aws configure --profile new-account
export AWS_PROFILE=new-account

# 2. Verify identity
aws sts get-caller-identity

# 3. Enable Bedrock models in us-east-1
#    AWS Console -> Bedrock -> Model access -> Enable Nova Lite + Titan Embed v2

# 4. Follow "AWS Deployment - Fresh Account" steps above (Steps 1-8)
#    The CloudFormation template is fully self-contained and creates all resources.

# 5. Key things that change per account:
#    - S3 bucket names include ACCOUNT_ID (auto-resolved)
#    - ECR repository URIs include ACCOUNT_ID (auto-resolved)
#    - params.json needs your Jira credentials for that account
```

---

## Cost Optimization — Scale to Zero

All ECS Fargate services automatically scale to **0 tasks** after 1 hour of no traffic, eliminating all compute costs when idle.

### How It Works

```
User visits site
       |
  CloudFront CDN
       |
  (cached frontend HTML/JS/CSS served immediately)
       |
  Frontend JS calls /api/* or /ws
       |
  ALB receives request -> routes to target group
       |
  Target group has 0 healthy targets -> returns 503
       |
  CloudWatch alarm fires: RequestCount >= 1
       |
  Auto-scaling policy: set DesiredCount = 1
       |
  ECS Fargate launches task (~30-60 seconds)
       |
  Target becomes healthy -> ALB routes traffic
       |
  User retries (or frontend auto-reconnects) -> works!
```

### Cost Breakdown When Idle (All Scaled to Zero)

| Resource | Monthly Cost (Idle) | Notes |
|----------|:---:|-------|
| ECS Backend | **$0** | Scaled to 0 tasks |
| ECS Frontend | **$0** | Scaled to 0 tasks |
| ECS AgentCore | **$0** | Scaled to 0 tasks |
| ALB | ~$16 | Fixed cost (always on) |
| NAT Gateway | ~$32 | Fixed cost (required for private subnets) |
| CloudFront | ~$0 | Pay per request only |
| S3 | ~$0.02/GB | Storage only |
| S3 Vectors | ~$0.01/GB | Storage only |
| CloudWatch | ~$0 | Free tier covers alarms |
| **Total (idle)** | **~$48/mo** | ALB + NAT are the fixed costs |

### Cost When Active

| Service | vCPU | Memory | Cost/hour |
|---------|------|--------|-----------|
| Backend | 1 | 2 GB | ~$0.05 |
| Frontend | 0.25 | 0.5 GB | ~$0.01 |
| AgentCore | 1 | 2 GB | ~$0.05 |
| **Total** | **2.25** | **4.5 GB** | **~$0.11/hr** |

### Auto-Scaling Configuration

| Service | Min | Max | Scale Up | Scale Down |
|---------|-----|-----|----------|------------|
| Backend | 0 | 2 | Any ALB request | 0 requests for 60 min |
| Frontend | 0 | 2 | Any ALB request | 0 requests for 60 min |
| AgentCore | 0 | 2 | Any ALB request | 0 requests for 60 min |

### Manual Scale Control

```bash
CLUSTER=production-exlerate-cluster

# Scale all services to 1 (wake up)
aws ecs update-service --cluster $CLUSTER --service production-backend --desired-count 1 --region us-east-1
aws ecs update-service --cluster $CLUSTER --service production-frontend --desired-count 1 --region us-east-1
aws ecs update-service --cluster $CLUSTER --service production-agentcore --desired-count 1 --region us-east-1

# Scale all services to 0 (shut down to save cost)
aws ecs update-service --cluster $CLUSTER --service production-backend --desired-count 0 --region us-east-1
aws ecs update-service --cluster $CLUSTER --service production-frontend --desired-count 0 --region us-east-1
aws ecs update-service --cluster $CLUSTER --service production-agentcore --desired-count 0 --region us-east-1

# Check current state
aws ecs describe-services --cluster $CLUSTER \
  --services production-backend production-frontend production-agentcore \
  --region us-east-1 \
  --query 'services[*].[serviceName,desiredCount,runningCount]' --output table
```

---

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `infrastructure/deploy.sh` | Full deploy (infra + build + deploy) | `./infrastructure/deploy.sh` |
| `infrastructure/deploy.sh --infra-only` | Deploy CloudFormation only | `./infrastructure/deploy.sh --infra-only` |
| `infrastructure/deploy.sh --skip-build` | Deploy without rebuilding | `./infrastructure/deploy.sh --skip-build` |
| `scripts/build-and-deploy.sh` | Build + deploy containers only | `./scripts/build-and-deploy.sh` |
| `scripts/setup-resources.sh` | Create S3 Vectors + Memory + SSM | `./scripts/setup-resources.sh --env production` |
| `scripts/load-ssm-env.sh` | Load SSM params into env vars | `eval $(./scripts/load-ssm-env.sh)` |
| `scripts/clean-s3.sh` | Wipe all runtime data | `./scripts/clean-s3.sh` or `./scripts/clean-s3.sh ACC-4` |

---

## Environment Variables

All config resolved via: **Env Var -> SSM Parameter Store -> Default**

| Variable | Used By | SSM Path | Default |
|----------|---------|----------|---------|
| `S3_BUCKET` | api, agentcore | `/agentcore/{env}/s3/documents-bucket` | `agentcore-docs-{account}` |
| `JIRA_CASES_BUCKET` | api | `/agentcore/{env}/s3/jira-cases-bucket` | `jira-cases-{account}-prod` |
| `VECTOR_BUCKET_NAME` | agentcore | `/agentcore/{env}/vectors/bucket-name` | `agentcore-vectors-{account}-{env}` |
| `VECTOR_INDEX_NAME` | agentcore | `/agentcore/{env}/vectors/index-name` | `pdf-chunks` |
| `AGENTCORE_MEMORY_ID` | agentcore | `/agentcore/{env}/memory/memory-id` | (from setup script) |
| `AWS_REGION` | all | `/agentcore/{env}/region` | `us-east-1` |
| `JIRA_BASE_URL` | agentcore | (ECS env) | from params.json |
| `JIRA_EMAIL` | agentcore | (ECS env) | from params.json |
| `JIRA_API_TOKEN` | agentcore | (ECS env) | from params.json |

---

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (email + password) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/user` | Current user |
| POST | `/api/auth/ws-token` | Generate WebSocket token (30s TTL) |

### Data
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload PDF to S3 |
| GET | `/api/documents/:ticketKey` | List documents for ticket |
| GET | `/api/extractions/:id` | Get extraction JSON |
| POST | `/api/extractions/:id/update` | Approve/reject/correct fields |
| GET | `/api/sessions/:ticketKey` | List chat sessions |

### Jira
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jira/tasks` | Dashboard cases from S3 |
| GET | `/api/jira/config` | Jira connection config |
| POST | `/api/jira/test-connection` | Test Jira API |

---

## AgentCore Agents & Tools

Agents are dynamically discovered via `GET /agents` on the AgentCore service.

| Agent | Tools | Description |
|-------|-------|-------------|
| **Planner** | `create_plan` | Breaks complex queries into steps with human approval |
| **Calculator** | `add`, `subtract`, `multiply`, `divide` | Math operations |
| **Doc Analysis** | `doc_analysis` | RAG over uploaded PDFs (S3 Vectors) |
| **Data Extraction** | `extract_data` | LangGraph: PDF -> structured fields -> validation |
| **Jira** | `jira_get_ticket`, `jira_get_comments`, `jira_add_comment`, `jira_search_tickets`, `jira_summarize_comments` | Jira ticket management |
| **Reconciliation** | `draft_reconciliation` | LangGraph: draft comments with human review loop |

### WebSocket Protocol

| Direction | Message Type | Description |
|-----------|-------------|-------------|
| Client -> | `set_ticket_context` | Link session to ticket |
| Client -> | `user_message` | Send user query |
| Client -> | `plan_approve` / `plan_reject` | Approve/reject plan |
| Client -> | `email_approve` / `email_revise` | Approve/revise draft |
| <- Server | `agent_response` | Streaming text chunk |
| <- Server | `agent_done` | Final response |
| <- Server | `tool_call` / `tool_result` | Tool invocation |
| <- Server | `plan_proposal` | Execution plan for approval |
| <- Server | `email_draft` | Reconciliation draft |
| <- Server | `data_extraction` | Extraction complete |

---

## Data Storage

| Data | S3 Key Pattern |
|------|---------------|
| Uploaded PDFs | `uploads/{userId}/{ticketKey}/{uuid}/{filename}` |
| Extractions | `extractions/{ticketKey}/{extractionId}.json` |
| Chat History | `chat-history/{ticketKey}/{sessionId}.json` |
| Sessions | `sessions/{ticketKey}/{sessionId}.json` |
| Reconciliation Drafts | `jira-comment-drafts/{draftId}.json` |
| PDF Vectors | S3 Vectors: `{ticketKey}/...chunk-N` |
| Long-term Memory | AgentCore Memory (90-day retention) |
| Dashboard Cases | `dashboard/all-cases.json` (separate bucket) |

---

## Monitoring & Troubleshooting

### Check Service Status

```bash
CLUSTER=production-exlerate-cluster

# Service status
aws ecs describe-services --cluster $CLUSTER \
  --services production-backend production-frontend production-agentcore \
  --region us-east-1 \
  --query 'services[*].[serviceName,status,desiredCount,runningCount]' --output table

# Recent events (useful for debugging)
aws ecs describe-services --cluster $CLUSTER \
  --services production-agentcore --region us-east-1 \
  --query 'services[0].events[0:5].message' --output text
```

### View Logs

```bash
# Backend logs
aws logs tail /ecs/production/exlerate-backend --follow --region us-east-1

# AgentCore logs
aws logs tail /ecs/production/exlerate-agentcore --follow --region us-east-1

# Frontend logs
aws logs tail /ecs/production/exlerate-frontend --follow --region us-east-1
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "No agents discovered" | AgentCore not running | `aws ecs update-service --cluster $CLUSTER --service production-agentcore --desired-count 1` |
| WebSocket disconnects | AgentCore scaled to 0 | Click "Connect" again (auto-scales up in ~30s) |
| "Failed to fetch agents" SyntaxError | `/agents` not routed to AgentCore | Check ALB listener rules for `/agents` path |
| Jira errors | Missing credentials in ECS | Check `JIRA_*` env vars in AgentCore task definition |
| 503 Service Unavailable | All services scaled to 0 | Wait 30-60s for auto-scale, or manually scale up |
| Docker Hub rate limit in CodeBuild | Unauthenticated pull limit | Use `public.ecr.aws/docker/library/` base images |

### Stack Deletion

```bash
# Scale services to 0 first
CLUSTER=production-exlerate-cluster
for svc in production-backend production-frontend production-agentcore; do
  aws ecs update-service --cluster $CLUSTER --service $svc --desired-count 0 --region us-east-1
done

# Delete CloudFormation stack
aws cloudformation delete-stack --stack-name exlerate-ai --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name exlerate-ai --region us-east-1

# Clean up non-CFN resources (S3 buckets, S3 Vectors, SSM params)
./scripts/clean-s3.sh
aws s3 rb s3://agentcore-docs-${ACCOUNT_ID} --force
aws s3 rb s3://jira-cases-${ACCOUNT_ID}-prod --force
```

---

## Quick Reference

```bash
# === FIRST-TIME SETUP (new AWS account) ===
export AWS_REGION=us-east-1 ENVIRONMENT=production
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws s3api create-bucket --bucket agentcore-docs-${ACCOUNT_ID} --region $AWS_REGION
aws s3api create-bucket --bucket jira-cases-${ACCOUNT_ID}-prod --region $AWS_REGION
echo '[]' | aws s3 cp - s3://jira-cases-${ACCOUNT_ID}-prod/dashboard/all-cases.json --content-type application/json
./scripts/setup-resources.sh --env $ENVIRONMENT --region $AWS_REGION
cp infrastructure/params.json.template infrastructure/params.json  # edit with your values
./infrastructure/deploy.sh

# === DEPLOY CODE CHANGES ===
./infrastructure/deploy.sh                   # full rebuild
./scripts/build-and-deploy.sh --backend-only # backend only

# === SCALE CONTROL ===
CLUSTER=production-exlerate-cluster
aws ecs update-service --cluster $CLUSTER --service production-backend --desired-count 1 --region us-east-1
aws ecs update-service --cluster $CLUSTER --service production-agentcore --desired-count 1 --region us-east-1

# === LOCAL DEV ===
npm run dev                          # Express + Python API
cd agentcore && python main.py       # AgentCore
open http://localhost:3001

# === MONITORING ===
aws logs tail /ecs/production/exlerate-agentcore --follow --region us-east-1
```
