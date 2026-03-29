"""Uploads, S3 documents, extractions, PDF proxy, session history."""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from botocore.exceptions import ClientError
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from api.credentials_service import load_credentials
from api.s3_helpers import bucket_name, s3_client

router = APIRouter(tags=["data"])


def _require_uid(request: Request) -> int:
    uid = request.session.get("user_id")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return int(uid)


def _s3_main():
    return s3_client(), bucket_name()


@router.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    ticketKey: str = Form("general"),
) -> dict[str, Any]:
    _require_uid(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    user_id = request.session["user_id"]
    upload_id = str(uuid.uuid4())
    s3_key = f"uploads/{user_id}/{ticketKey}/{upload_id}/{file.filename}"

    c = load_credentials()
    aws = c["aws"]
    region = aws.get("region") or "us-east-1"
    bn = (
        aws.get("services", {}).get("s3", {}).get("bucket_name")
    )
    if not bn:
        raise HTTPException(
            status_code=500,
            detail="S3 bucket not configured. Set aws.services.s3.bucket_name in credentials.json",
        )

    import boto3

    client = boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=aws["access_key_id"],
        aws_secret_access_key=aws["secret_access_key"],
        aws_session_token=aws.get("session_token") or None,
    )
    body = await file.read()
    client.put_object(
        Bucket=bn,
        Key=s3_key,
        Body=body,
        ContentType=file.content_type or "application/octet-stream",
    )
    return {
        "success": True,
        "uploadId": upload_id,
        "s3Key": s3_key,
        "fileName": file.filename,
        "size": len(body),
        "bucket": bn,
    }


@router.get("/documents/{ticket_key}")
async def list_documents(request: Request, ticket_key: str) -> list[dict[str, Any]]:
    uid = _require_uid(request)
    prefix = f"uploads/{uid}/{ticket_key}/"
    client, bn = _s3_main()
    if not bn:
        return []
    try:
        resp = client.list_objects_v2(Bucket=bn, Prefix=prefix)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    out = []
    for obj in resp.get("Contents") or []:
        k = obj.get("Key")
        if not k:
            continue
        out.append(
            {
                "key": k,
                "fileName": k.split("/")[-1],
                "size": obj.get("Size"),
                "lastModified": obj.get("LastModified").isoformat()
                if obj.get("LastModified")
                else None,
            }
        )
    return out


@router.get("/extractions/{extraction_id}")
async def get_extraction(
    request: Request,
    extraction_id: str,
    ticketKey: Optional[str] = Query(None),
) -> dict[str, Any]:
    _require_uid(request)
    client, bn = _s3_main()
    ticket_key = ticketKey or ""

    extraction_data = None
    if ticket_key:
        try:
            key = f"extractions/{ticket_key}/{extraction_id}.json"
            resp = client.get_object(Bucket=bn, Key=key)
            extraction_data = json.loads(resp["Body"].read().decode("utf-8"))
        except ClientError:
            pass

    if not extraction_data:
        try:
            lr = client.list_objects_v2(Bucket=bn, Prefix="extractions/")
            for obj in lr.get("Contents") or []:
                ok = obj.get("Key")
                if ok and extraction_id in ok:
                    resp = client.get_object(Bucket=bn, Key=ok)
                    extraction_data = json.loads(resp["Body"].read().decode("utf-8"))
                    break
        except ClientError:
            pass

    if not extraction_data:
        raise HTTPException(status_code=404, detail="Extraction not found")

    pdf_presigned_url = ""
    s3_key = extraction_data.get("s3_key") or ""
    if s3_key:
        try:
            pdf_presigned_url = client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bn, "Key": s3_key},
                ExpiresIn=900,
            )
        except Exception:
            pass

    return {**extraction_data, "pdfPresignedUrl": pdf_presigned_url}


@router.get("/extractions/list/{ticket_key}")
async def list_extractions(
    request: Request,
    ticket_key: str,
) -> list[dict[str, Any]]:
    """List all extractions for a ticket from S3."""
    _require_uid(request)
    client, bn = _s3_main()
    prefix = f"extractions/{ticket_key}/"
    results = []
    try:
        resp = client.list_objects_v2(Bucket=bn, Prefix=prefix)
        for obj in resp.get("Contents", []):
            try:
                data = client.get_object(Bucket=bn, Key=obj["Key"])
                extraction = json.loads(data["Body"].read().decode())
                # Return summary only (not full extracted_data for list view)
                results.append({
                    "extraction_id": extraction.get("extraction_id", ""),
                    "ticket_key": extraction.get("ticket_key", ticket_key),
                    "status": extraction.get("status", "unknown"),
                    "created_at": extraction.get("created_at", ""),
                    "s3_key": extraction.get("s3_key", ""),
                    "field_count": len(extraction.get("extracted_data", [])),
                    "approved_count": sum(
                        1 for f in extraction.get("extracted_data", [])
                        if f.get("field_status") == "approved"
                    ),
                    "document_name": (extraction.get("s3_key") or "").split("/")[-1] or "Unknown",
                })
            except Exception:
                continue
    except Exception:
        pass
    # Sort by created_at descending
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


class ExtractionUpdateBody(BaseModel):
    action: Optional[str] = None
    fieldName: Optional[str] = None
    fieldStatus: Optional[str] = None
    correction: Optional[str] = None
    ticketKey: Optional[str] = None


@router.post("/extractions/{extraction_id}/update")
async def update_extraction(
    request: Request,
    extraction_id: str,
    body: ExtractionUpdateBody,
) -> dict[str, Any]:
    _require_uid(request)
    client, bn = _s3_main()
    ticket_key = body.ticketKey or ""

    extraction_key = ""
    extraction_data = None
    if ticket_key:
        extraction_key = f"extractions/{ticket_key}/{extraction_id}.json"
        try:
            resp = client.get_object(Bucket=bn, Key=extraction_key)
            extraction_data = json.loads(resp["Body"].read().decode("utf-8"))
        except ClientError:
            pass

    if not extraction_data:
        lr = client.list_objects_v2(Bucket=bn, Prefix="extractions/")
        for obj in lr.get("Contents") or []:
            ok = obj.get("Key")
            if ok and extraction_id in ok:
                extraction_key = ok
                resp = client.get_object(Bucket=bn, Key=ok)
                extraction_data = json.loads(resp["Body"].read().decode("utf-8"))
                break

    if not extraction_data:
        raise HTTPException(status_code=404, detail="Extraction not found")

    if body.action == "approve_all":
        extraction_data["status"] = "approved"
        for field in extraction_data.get("extracted_data") or []:
            if field.get("field_status") == "pending":
                field["field_status"] = "approved"
    elif body.action == "reject_all":
        extraction_data["status"] = "rejected"
    elif body.action == "update_field" and body.fieldName:
        for field in extraction_data.get("extracted_data") or []:
            if field.get("field_name") == body.fieldName:
                field["field_status"] = body.fieldStatus or "approved"
                if body.correction:
                    field["correction"] = body.correction
                break

    client.put_object(
        Bucket=bn,
        Key=extraction_key,
        Body=json.dumps(extraction_data).encode("utf-8"),
        ContentType="application/json",
    )
    return extraction_data


@router.get("/pdf-presigned")
async def pdf_presigned(request: Request, key: Optional[str] = Query(None)) -> dict[str, str]:
    _require_uid(request)
    if not key:
        raise HTTPException(status_code=400, detail="key parameter required")
    client, bn = _s3_main()
    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bn, "Key": key},
            ExpiresIn=900,
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/pdf-proxy")
async def pdf_proxy(request: Request, key: Optional[str] = Query(None), bucket: Optional[str] = Query(None)):
    from fastapi.responses import StreamingResponse

    _require_uid(request)
    if not key:
        raise HTTPException(status_code=400, detail="key parameter required")
    client, default_bn = _s3_main()
    bn = bucket or default_bn
    try:
        resp = client.get_object(Bucket=bn, Key=key)
        name = key.split("/")[-1]
        size = resp.get("ContentLength", 0)

        def stream():
            body = resp["Body"]
            while chunk := body.read(64 * 1024):  # 64KB chunks
                yield chunk

        return StreamingResponse(
            stream(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{name}"',
                "Content-Length": str(size),
                "Cache-Control": "private, max-age=3600",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/sessions/{ticket_key}")
async def list_sessions(request: Request, ticket_key: str) -> list[dict[str, Any]]:
    _require_uid(request)
    prefix = f"sessions/{ticket_key}/"
    client, bn = _s3_main()
    lr = client.list_objects_v2(Bucket=bn, Prefix=prefix)
    sessions: list[dict[str, Any]] = []
    for obj in lr.get("Contents") or []:
        ok = obj.get("Key")
        if not ok or not ok.endswith(".json"):
            continue
        try:
            resp = client.get_object(Bucket=bn, Key=ok)
            sessions.append(json.loads(resp["Body"].read().decode("utf-8")))
        except Exception:
            continue
    sessions.sort(key=lambda x: x.get("last_active") or "", reverse=True)
    return sessions


@router.get("/sessions/{ticket_key}/{session_id}/messages")
async def session_messages(
    request: Request,
    ticket_key: str,
    session_id: str,
) -> list[Any]:
    _require_uid(request)
    key = f"chat-history/{ticket_key}/{session_id}.json"
    client, bn = _s3_main()
    try:
        resp = client.get_object(Bucket=bn, Key=key)
        return json.loads(resp["Body"].read().decode("utf-8"))
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "NoSuchKey":
            return []
        raise HTTPException(status_code=500, detail=str(e)) from e
