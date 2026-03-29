"""AWS / Bedrock / S3 settings and shared boto3 clients.

Resolution order for each setting:
  1. Environment variable (set by ECS Task Def, docker-compose, or shell)
  2. SSM Parameter Store (set by scripts/setup-resources.sh)
  3. Hardcoded default (local dev fallback only)
"""

import logging
import os

import boto3

logger = logging.getLogger("agentcore.settings")

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
ENV_NAME = os.environ.get("ENVIRONMENT", "production")
SSM_PREFIX = f"/agentcore/{ENV_NAME}"


def _ssm_get(param_suffix: str) -> str:
    """Try to read a value from SSM Parameter Store. Returns '' on failure."""
    try:
        ssm = boto3.client("ssm", region_name=AWS_REGION)
        resp = ssm.get_parameter(Name=f"{SSM_PREFIX}/{param_suffix}")
        return resp["Parameter"]["Value"]
    except Exception:
        return ""


def _resolve(env_var: str, ssm_suffix: str, default: str) -> str:
    """Resolve a config value: env var → SSM → default."""
    val = os.environ.get(env_var)
    if val:
        return val
    val = _ssm_get(ssm_suffix)
    if val:
        logger.info(f"Loaded {env_var} from SSM: {SSM_PREFIX}/{ssm_suffix}")
        return val
    return default


# ── Resolved Settings ────────────────────────────────────────────────────────

S3_BUCKET = _resolve("S3_BUCKET", "s3/documents-bucket", "agentcore-docs-876570154422")
VECTOR_BUCKET_NAME = _resolve("VECTOR_BUCKET_NAME", "vectors/bucket-name", "my-pdf-vectors")
VECTOR_INDEX_NAME = _resolve("VECTOR_INDEX_NAME", "vectors/index-name", "pdf-chunks")
MEMORY_ID = _resolve("AGENTCORE_MEMORY_ID", "memory/memory-id", "")
JIRA_CASES_BUCKET = _resolve("JIRA_CASES_BUCKET", "s3/jira-cases-bucket", "jira-cases-876570154422-prod")

EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
LLM_MODEL_ID = "amazon.nova-lite-v1:0"
TOP_K = 5

logger.info(f"Settings: region={AWS_REGION}, bucket={S3_BUCKET}, vectors={VECTOR_BUCKET_NAME}/{VECTOR_INDEX_NAME}, memory={MEMORY_ID[:20]}...")

# ── Shared Clients ───────────────────────────────────────────────────────────

bedrock_runtime = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3vectors_client = boto3.client("s3vectors", region_name=AWS_REGION)
s3_client = boto3.client("s3", region_name=AWS_REGION)

# ── AgentCore Long-Term Memory ───────────────────────────────────────────────
from bedrock_agentcore.memory import MemoryClient

memory_client = MemoryClient(region_name=AWS_REGION)
