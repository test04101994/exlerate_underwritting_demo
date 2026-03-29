"""Settings for AgentCore Submissions — reuses same pattern as main AgentCore."""

import logging
import os

import boto3

logger = logging.getLogger("agentcore-submissions.settings")

AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
ENV_NAME = os.environ.get("ENVIRONMENT", "production")
SSM_PREFIX = f"/agentcore/{ENV_NAME}"


def _ssm_get(param_suffix: str) -> str:
    try:
        ssm = boto3.client("ssm", region_name=AWS_REGION)
        resp = ssm.get_parameter(Name=f"{SSM_PREFIX}/{param_suffix}")
        return resp["Parameter"]["Value"]
    except Exception:
        return ""


def _resolve(env_var: str, ssm_suffix: str, default: str) -> str:
    val = os.environ.get(env_var)
    if val:
        return val
    val = _ssm_get(ssm_suffix)
    if val:
        return val
    return default


S3_BUCKET = _resolve("S3_BUCKET", "s3/documents-bucket", "agentcore-docs-876570154422")
VECTOR_BUCKET_NAME = _resolve("VECTOR_BUCKET_NAME", "vectors/bucket-name", "my-pdf-vectors")
VECTOR_INDEX_NAME = _resolve("VECTOR_INDEX_NAME", "vectors/index-name", "pdf-chunks")
MEMORY_ID = _resolve("AGENTCORE_MEMORY_ID", "memory/memory-id", "")

EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0"
LLM_MODEL_ID = "amazon.nova-lite-v1:0"
TOP_K = 5

bedrock_runtime = boto3.client("bedrock-runtime", region_name=AWS_REGION)
s3vectors_client = boto3.client("s3vectors", region_name=AWS_REGION)
s3_client = boto3.client("s3", region_name=AWS_REGION)

# AgentCore Long-Term Memory
try:
    from bedrock_agentcore.memory import MemoryClient
    memory_client = MemoryClient(region_name=AWS_REGION)
except Exception:
    memory_client = None
