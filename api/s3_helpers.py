"""Shared boto3 S3 helpers using credentials.json."""

from __future__ import annotations

import os

from typing import Any

import boto3
from botocore.client import BaseClient

from api.credentials_service import load_credentials


def s3_client() -> BaseClient:
    c = load_credentials()
    aws = c["aws"]
    region = aws.get("region") or "us-east-1"
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=aws["access_key_id"],
        aws_secret_access_key=aws["secret_access_key"],
        aws_session_token=aws.get("session_token") or None,
    )


def bucket_name() -> str:
    c = load_credentials()
    return (
        c.get("aws", {})
        .get("services", {})
        .get("s3", {})
        .get("bucket_name")
        or os.environ.get("S3_BUCKET", "agentcore-docs-876570154422")
    )
