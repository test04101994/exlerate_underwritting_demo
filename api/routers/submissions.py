"""New Business Submissions Queue — reads from DynamoDB email-logs table."""

from __future__ import annotations

import json
import os
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/submissions", tags=["submissions"])

DYNAMODB_TABLE = os.environ.get("EMAIL_LOGS_TABLE", "email-logs")
DOCUMENTS_TABLE = os.environ.get("DOCUMENTS_TABLE", "email-documents-v2")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
EMAIL_BUCKET = os.environ.get("EMAIL_BUCKET", "underwriting-app-emails")


def _get_table():
    dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
    return dynamodb.Table(DYNAMODB_TABLE)


def _get_docs_table():
    dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
    return dynamodb.Table(DOCUMENTS_TABLE)


@router.get("/")
async def list_submissions() -> list[dict[str, Any]]:
    """Return all email submissions sorted by received_at descending."""
    try:
        table = _get_table()
        # Use GSI to get sorted results, or scan for small tables
        response = table.scan()
        items = response.get("Items", [])

        # Handle pagination for large tables
        while "LastEvaluatedKey" in response:
            response = table.scan(ExclusiveStartKey=response["LastEvaluatedKey"])
            items.extend(response.get("Items", []))

        # Sort by received_at descending
        items.sort(key=lambda x: x.get("received_at", ""), reverse=True)

        # Convert DynamoDB types for JSON serialization
        for item in items:
            if "attachment_count" in item:
                item["attachment_count"] = int(item["attachment_count"])
            if "raw_size_bytes" in item:
                item["raw_size_bytes"] = int(item["raw_size_bytes"])
            if "files" in item:
                for f in item["files"]:
                    if "size_bytes" in f:
                        f["size_bytes"] = int(f["size_bytes"])

        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch submissions: {str(e)}")


@router.get("/{email_id}")
async def get_submission(email_id: str) -> dict[str, Any]:
    """Return a single submission by email_id (root GUID)."""
    try:
        table = _get_table()
        response = table.get_item(Key={"email_id": email_id})
        item = response.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Submission not found")

        if "attachment_count" in item:
            item["attachment_count"] = int(item["attachment_count"])
        if "raw_size_bytes" in item:
            item["raw_size_bytes"] = int(item["raw_size_bytes"])
        if "files" in item:
            for f in item["files"]:
                if "size_bytes" in f:
                    f["size_bytes"] = int(f["size_bytes"])

        return item
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch submission: {str(e)}")


@router.get("/{email_id}/email-body")
async def get_email_body(email_id: str):
    """Return the HTML/text body of the email for rendering."""
    import email as email_lib
    from email import policy as email_policy
    from fastapi.responses import HTMLResponse

    try:
        # Get the email.eml S3 key from documents table
        docs_table = _get_docs_table()
        response = docs_table.query(
            IndexName="email-id-index",
            KeyConditionExpression=Key("email_id").eq(email_id),
        )
        eml_doc = next((d for d in response.get("Items", []) if d.get("doc_type") == "email"), None)
        if not eml_doc:
            raise HTTPException(status_code=404, detail="Email not found")

        s3_client = boto3.client("s3", region_name=AWS_REGION)
        obj = s3_client.get_object(Bucket=eml_doc.get("s3_bucket", EMAIL_BUCKET), Key=eml_doc["s3_key"])
        raw_bytes = obj["Body"].read()

        msg = email_lib.message_from_bytes(raw_bytes, policy=email_policy.default)

        # Try HTML body first, then plain text
        html_body = None
        text_body = None
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html" and not html_body:
                html_body = part.get_content()
            elif ct == "text/plain" and not text_body:
                text_body = part.get_content()

        if html_body:
            # Wrap in full HTML doc if it's just a fragment
            if "<html" not in html_body.lower():
                html_body = f"<html><head><meta charset='utf-8'><style>body{{font-family:sans-serif;padding:20px;margin:0;color:#333;line-height:1.6}}</style></head><body>{html_body}</body></html>"
            return HTMLResponse(content=html_body)
        if text_body:
            escaped = text_body.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            return HTMLResponse(content=f"<html><body><pre style='font-family:sans-serif;white-space:pre-wrap;padding:20px;'>{escaped}</pre></body></html>")
        return HTMLResponse(content="<html><body><p>No readable content in this email.</p></body></html>")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read email: {str(e)}")


@router.get("/{email_id}/documents")
async def list_documents(email_id: str) -> list[dict[str, Any]]:
    """Return all documents for a given email submission."""
    try:
        docs_table = _get_docs_table()
        response = docs_table.query(
            IndexName="email-id-index",
            KeyConditionExpression=Key("email_id").eq(email_id),
        )
        items = response.get("Items", [])

        # Generate presigned URLs for each document
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        for item in items:
            if "size_bytes" in item:
                item["size_bytes"] = int(item["size_bytes"])
            if "pdf_size_bytes" in item:
                item["pdf_size_bytes"] = int(item["pdf_size_bytes"])
            # Presigned URL for the original file
            if item.get("s3_key"):
                item["presigned_url"] = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": item.get("s3_bucket", EMAIL_BUCKET), "Key": item["s3_key"]},
                    ExpiresIn=3600,
                )
            # Presigned URL for the PDF version
            if item.get("pdf_s3_key"):
                item["pdf_presigned_url"] = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": item.get("s3_bucket", EMAIL_BUCKET), "Key": item["pdf_s3_key"]},
                    ExpiresIn=3600,
                )

        # Sort: email first, then attachments
        items.sort(key=lambda x: (0 if x.get("doc_type") == "email" else 1, x.get("filename", "")))
        return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch documents: {str(e)}")


@router.get("/{email_id}/extraction")
async def get_submission_extraction(email_id: str) -> dict[str, Any]:
    """Get the extraction.json for a submission — single file, fast lookup."""
    try:
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        key = f"emails/{email_id}/extraction.json"
        data = s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        return json.loads(data["Body"].read().decode())
    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="No extraction found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{email_id}/extractions")
async def list_extractions(email_id: str) -> list[dict[str, Any]]:
    """List all extractions for an email submission."""
    try:
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        prefix = f"emails/{email_id}/"
        response = s3_client.list_objects_v2(Bucket=EMAIL_BUCKET, Prefix=prefix)
        extractions = []
        for obj in response.get("Contents", []):
            if "extraction-" in obj["Key"] and obj["Key"].endswith(".json"):
                try:
                    data = s3_client.get_object(Bucket=EMAIL_BUCKET, Key=obj["Key"])
                    ext = json.loads(data["Body"].read().decode())
                    # Summary only (no full extracted_data)
                    extractions.append({
                        "extraction_id": ext.get("extraction_id"),
                        "email_id": ext.get("email_id"),
                        "document_name": ext.get("document_name", ""),
                        "status": ext.get("status", "pending_review"),
                        "created_at": ext.get("created_at", ""),
                        "field_count": len(ext.get("extracted_data", [])),
                        "approved_count": sum(1 for f in ext.get("extracted_data", []) if f.get("field_status") == "approved"),
                        "s3_key": ext.get("s3_key", ""),
                    })
                except Exception:
                    continue
        return extractions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list extractions: {str(e)}")


@router.get("/{email_id}/extractions/{extraction_id}")
async def get_extraction(email_id: str, extraction_id: str) -> dict[str, Any]:
    """Get full extraction data including extracted fields."""
    try:
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        key = f"emails/{email_id}/extraction-{extraction_id}.json"
        response = s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        ext = json.loads(response["Body"].read().decode())

        # Add presigned URL for the source PDF
        if ext.get("s3_key"):
            ext["pdfProxyUrl"] = f"/api/pdf-proxy?key={ext['s3_key']}&bucket={EMAIL_BUCKET}"

        return ext
    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="Extraction not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch extraction: {str(e)}")


@router.post("/{email_id}/extractions/{extraction_id}/update")
async def update_extraction(email_id: str, extraction_id: str, request_data: dict = None) -> dict[str, Any]:
    """Update extraction field status (approve/reject/correct)."""
    from fastapi import Request
    import json as json_mod

    if request_data is None:
        request_data = {}

    try:
        s3_client = boto3.client("s3", region_name=AWS_REGION)
        key = f"emails/{email_id}/extraction-{extraction_id}.json"
        response = s3_client.get_object(Bucket=EMAIL_BUCKET, Key=key)
        ext = json.loads(response["Body"].read().decode())

        action = request_data.get("action", "update_field")
        fields = ext.get("extracted_data", [])

        if action == "approve_all":
            for f in fields:
                f["field_status"] = "approved"
            ext["status"] = "approved"
        elif action == "reject_all":
            for f in fields:
                f["field_status"] = "rejected"
            ext["status"] = "rejected"
        elif action == "update_field":
            field_name = request_data.get("fieldName", "")
            field_status = request_data.get("fieldStatus", "pending")
            correction = request_data.get("correction", "")
            for f in fields:
                if f["field_name"] == field_name:
                    f["field_status"] = field_status
                    if correction:
                        f["correction"] = correction
                    break

        ext["extracted_data"] = fields

        # Save back to S3
        s3_client.put_object(
            Bucket=EMAIL_BUCKET,
            Key=key,
            Body=json.dumps(ext, indent=2, default=str),
            ContentType="application/json",
        )

        if ext.get("s3_key"):
            ext["pdfProxyUrl"] = f"/api/pdf-proxy?key={ext['s3_key']}&bucket={EMAIL_BUCKET}"

        return ext
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update extraction: {str(e)}")
