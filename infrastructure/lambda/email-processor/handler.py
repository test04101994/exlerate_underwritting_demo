"""
Email Processor Lambda — parses MIME emails, extracts attachments,
converts email.eml and office docs to PDF via LibreOffice, stores
everything in S3 with GUID/sub-GUID folder structure, and logs to DynamoDB.
"""

import json
import uuid
import email
import os
import re
import subprocess
import tempfile
import shutil
from email import policy
from email.utils import parseaddr, parsedate_to_datetime
from datetime import datetime, timezone
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

BUCKET = os.environ["EMAIL_BUCKET"]
TABLE = os.environ["DYNAMODB_TABLE"]
DOCS_TABLE = os.environ.get("DOCUMENTS_TABLE", "email-documents-v2")

# Bedrock removed — using hardcoded extraction for now

DEFAULT_FIELDS = [
    "insured_name", "policy_number", "effective_date", "expiration_date",
    "premium_amount", "coverage_limit", "deductible", "broker_name",
    "insured_address", "risk_description",
]

# File extensions that LibreOffice can convert to PDF
CONVERTIBLE_EXTENSIONS = {
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".rtf", ".txt", ".csv",
    ".eml",
}


def sanitize_filename(name):
    """Remove unsafe characters from attachment filenames."""
    if not name:
        return "unnamed_attachment"
    name = re.sub(r"[^\w\s\-.]", "_", name)
    name = re.sub(r"\s+", "_", name)
    return name[:200]


def convert_to_pdf(input_path, output_dir):
    """Convert a file to PDF using LibreOffice headless. Returns PDF path or None."""
    try:
        result = subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--norestore",
                "--convert-to", "pdf",
                "--outdir", output_dir,
                input_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            logger.warning(f"LibreOffice conversion failed: {result.stderr}")
            return None

        # Find the generated PDF
        base_name = os.path.splitext(os.path.basename(input_path))[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
        if os.path.exists(pdf_path):
            return pdf_path
        logger.warning(f"PDF not found after conversion: {pdf_path}")
        return None
    except subprocess.TimeoutExpired:
        logger.error("LibreOffice conversion timed out")
        return None
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        return None


def should_convert(filename):
    """Check if a file should be converted to PDF."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in CONVERTIBLE_EXTENSIONS


def extract_fields_from_pdf(pdf_path):
    """Return hardcoded extraction data — Bedrock call removed for now."""
    logger.info(f"Hardcoded extraction for: {pdf_path}")
    return [
        {"field_name": "Policy Number", "value": "POL-2025-001234", "confidence": 0.95,
         "page": 1, "coordinates": [72.0, 150.0, 250.0, 165.0],
         "field_status": "pending", "correction": "", "section": "Policy Information", "group_index": 1},
        {"field_name": "Insured Name", "value": "Acme Global Industries Ltd", "confidence": 0.92,
         "page": 1, "coordinates": [72.0, 180.0, 300.0, 195.0],
         "field_status": "pending", "correction": "", "section": "Parties & Contacts", "group_index": 1},
        {"field_name": "Insured Address", "value": "1200 Commerce Blvd, Suite 400, Dallas, TX 75201", "confidence": 0.90,
         "page": 1, "coordinates": [72.0, 210.0, 350.0, 225.0],
         "field_status": "pending", "correction": "", "section": "Parties & Contacts", "group_index": 1},
        {"field_name": "Property Type", "value": "Commercial", "confidence": 0.94,
         "page": 1, "coordinates": [72.0, 240.0, 200.0, 255.0],
         "field_status": "pending", "correction": "", "section": "Property Details", "group_index": 2},
        {"field_name": "Construction Type", "value": "Fire Resistive", "confidence": 0.91,
         "page": 1, "coordinates": [72.0, 270.0, 220.0, 285.0],
         "field_status": "pending", "correction": "", "section": "Property Details", "group_index": 2},
        {"field_name": "Year Built", "value": "2005", "confidence": 0.93,
         "page": 1, "coordinates": [72.0, 300.0, 150.0, 315.0],
         "field_status": "pending", "correction": "", "section": "Property Details", "group_index": 2},
        {"field_name": "Occupancy Type", "value": "Office", "confidence": 0.92,
         "page": 1, "coordinates": [72.0, 330.0, 180.0, 345.0],
         "field_status": "pending", "correction": "", "section": "Property Details", "group_index": 2},
        {"field_name": "Total Insured Value", "value": "4500000", "confidence": 0.94,
         "page": 1, "coordinates": [72.0, 360.0, 220.0, 375.0],
         "field_status": "pending", "correction": "", "section": "Coverage & Financials", "group_index": 3},
        {"field_name": "Coverage Type", "value": "All Risk", "confidence": 0.93,
         "page": 1, "coordinates": [72.0, 390.0, 200.0, 405.0],
         "field_status": "pending", "correction": "", "section": "Coverage & Financials", "group_index": 3},
        {"field_name": "Loss History", "value": "2 claims in last 5 years, total $45,000", "confidence": 0.88,
         "page": 1, "coordinates": [72.0, 420.0, 350.0, 435.0],
         "field_status": "pending", "correction": "", "section": "Claims History", "group_index": 4},
    ]


def handler(event, context):
    table = dynamodb.Table(TABLE)
    docs_table = dynamodb.Table(DOCS_TABLE)

    for record in event["Records"]:
        s3_key = record["s3"]["object"]["key"]
        logger.info(f"Processing: s3://{BUCKET}/{s3_key}")

        # 1. Download raw email
        raw_obj = s3.get_object(Bucket=BUCKET, Key=s3_key)
        raw_bytes = raw_obj["Body"].read()
        raw_size = len(raw_bytes)

        # 2. Parse MIME
        msg = email.message_from_bytes(raw_bytes, policy=policy.default)
        from_name, from_addr = parseaddr(msg.get("From", ""))
        to_raw = msg.get("To", "")
        to_addrs = [parseaddr(a)[1] for a in to_raw.split(",") if parseaddr(a)[1]]
        subject = msg.get("Subject", "(no subject)")
        message_id = msg.get("Message-ID", "")
        date_header = msg.get("Date", "")

        try:
            received_at = parsedate_to_datetime(date_header).isoformat()
        except Exception:
            received_at = datetime.now(timezone.utc).isoformat()

        # 3. Generate ROOT GUID
        root_guid = str(uuid.uuid4())
        prefix = f"emails/{root_guid}"
        files_manifest = []

        # Create temp working directory
        work_dir = tempfile.mkdtemp()

        try:
            # 4. Store raw email with its own sub-GUID
            email_sub_guid = str(uuid.uuid4())
            email_key = f"{prefix}/{email_sub_guid}/email.eml"
            s3.put_object(
                Bucket=BUCKET,
                Key=email_key,
                Body=raw_bytes,
                ContentType="message/rfc822",
                Metadata={"root-guid": root_guid, "sub-guid": email_sub_guid},
            )

            file_entry = {
                "sub_guid": email_sub_guid,
                "filename": "email.eml",
                "content_type": "message/rfc822",
                "size_bytes": raw_size,
                "type": "email",
            }

            # Convert email.eml to PDF
            eml_path = os.path.join(work_dir, "email.eml")
            with open(eml_path, "wb") as f:
                f.write(raw_bytes)

            pdf_path = convert_to_pdf(eml_path, work_dir)
            if pdf_path:
                with open(pdf_path, "rb") as f:
                    pdf_bytes = f.read()
                pdf_key = f"{prefix}/{email_sub_guid}/email.pdf"
                s3.put_object(
                    Bucket=BUCKET,
                    Key=pdf_key,
                    Body=pdf_bytes,
                    ContentType="application/pdf",
                    Metadata={"root-guid": root_guid, "sub-guid": email_sub_guid},
                )
                file_entry["pdf_filename"] = "email.pdf"
                file_entry["pdf_size_bytes"] = len(pdf_bytes)
                logger.info(f"Converted email.eml → PDF ({len(pdf_bytes)} bytes)")

            files_manifest.append(file_entry)
            logger.info(f"Stored email.eml → {email_key}")

            # Write email document record to documents table
            doc_record = {
                "document_id": email_sub_guid,
                "email_id": root_guid,
                "filename": "email.eml",
                "content_type": "message/rfc822",
                "size_bytes": raw_size,
                "s3_bucket": BUCKET,
                "s3_key": email_key,
                "s3_uri": f"s3://{BUCKET}/{email_key}",
                "doc_type": "email",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if file_entry.get("pdf_filename"):
                doc_record["pdf_s3_key"] = f"{prefix}/{email_sub_guid}/email.pdf"
                doc_record["pdf_s3_uri"] = f"s3://{BUCKET}/{prefix}/{email_sub_guid}/email.pdf"
                doc_record["pdf_size_bytes"] = file_entry.get("pdf_size_bytes", 0)
            docs_table.put_item(Item=doc_record)

            # 5. Extract and store attachments
            attachment_count = 0
            for part in msg.walk():
                content_disposition = part.get_content_disposition()
                if content_disposition not in ("attachment", "inline"):
                    continue
                if part.get_content_maintype() == "multipart":
                    continue

                filename = part.get_filename()
                if not filename:
                    ext = part.get_content_type().split("/")[-1]
                    filename = f"attachment_{attachment_count + 1}.{ext}"

                filename = sanitize_filename(filename)
                payload = part.get_payload(decode=True)
                if not payload:
                    continue

                att_sub_guid = str(uuid.uuid4())
                att_key = f"{prefix}/{att_sub_guid}/{filename}"
                content_type = part.get_content_type() or "application/octet-stream"

                s3.put_object(
                    Bucket=BUCKET,
                    Key=att_key,
                    Body=payload,
                    ContentType=content_type,
                    Metadata={"root-guid": root_guid, "sub-guid": att_sub_guid},
                )

                att_entry = {
                    "sub_guid": att_sub_guid,
                    "filename": filename,
                    "content_type": content_type,
                    "size_bytes": len(payload),
                    "type": "attachment",
                }

                # Convert office docs to PDF
                if should_convert(filename):
                    att_path = os.path.join(work_dir, filename)
                    with open(att_path, "wb") as f:
                        f.write(payload)
                    att_pdf_path = convert_to_pdf(att_path, work_dir)
                    if att_pdf_path:
                        with open(att_pdf_path, "rb") as f:
                            att_pdf_bytes = f.read()
                        pdf_filename = os.path.splitext(filename)[0] + ".pdf"
                        pdf_key = f"{prefix}/{att_sub_guid}/{pdf_filename}"
                        s3.put_object(
                            Bucket=BUCKET,
                            Key=pdf_key,
                            Body=att_pdf_bytes,
                            ContentType="application/pdf",
                            Metadata={"root-guid": root_guid, "sub-guid": att_sub_guid},
                        )
                        att_entry["pdf_filename"] = pdf_filename
                        att_entry["pdf_size_bytes"] = len(att_pdf_bytes)
                        logger.info(f"Converted {filename} → PDF ({len(att_pdf_bytes)} bytes)")

                files_manifest.append(att_entry)
                attachment_count += 1
                logger.info(f"Stored {filename} → {att_key}")

                # Write attachment document record
                att_doc = {
                    "document_id": att_sub_guid,
                    "email_id": root_guid,
                    "filename": filename,
                    "content_type": content_type,
                    "size_bytes": len(payload),
                    "s3_bucket": BUCKET,
                    "s3_key": att_key,
                    "s3_uri": f"s3://{BUCKET}/{att_key}",
                    "doc_type": "attachment",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                if att_entry.get("pdf_filename"):
                    att_doc["pdf_s3_key"] = f"{prefix}/{att_sub_guid}/{att_entry['pdf_filename']}"
                    att_doc["pdf_s3_uri"] = f"s3://{BUCKET}/{prefix}/{att_sub_guid}/{att_entry['pdf_filename']}"
                    att_doc["pdf_size_bytes"] = att_entry.get("pdf_size_bytes", 0)
                docs_table.put_item(Item=att_doc)

            # 6. Write metadata.json
            metadata = {
                "email_id": root_guid,
                "received_at": received_at,
                "processed_at": datetime.now(timezone.utc).isoformat(),
                "from_address": from_addr,
                "from_name": from_name,
                "to_addresses": to_addrs,
                "subject": subject,
                "message_id": message_id,
                "attachment_count": attachment_count,
                "files": files_manifest,
                "s3_bucket": BUCKET,
                "s3_prefix": f"{prefix}/",
                "original_s3_key": s3_key,
                "raw_size_bytes": raw_size,
            }

            s3.put_object(
                Bucket=BUCKET,
                Key=f"{prefix}/metadata.json",
                Body=json.dumps(metadata, indent=2, default=str),
                ContentType="application/json",
            )

            # 7. Log to DynamoDB — status "extracting" while extraction runs
            has_pdf_attachments = any(
                f.get("type") == "attachment" and f.get("filename", "").lower().endswith(".pdf")
                for f in files_manifest
            )
            initial_status = "extracting" if has_pdf_attachments else "processed"

            table.put_item(
                Item={
                    "email_id": root_guid,
                    "received_at": received_at,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "from_address": from_addr,
                    "to_addresses": to_addrs,
                    "subject": subject,
                    "message_id": message_id,
                    "s3_bucket": BUCKET,
                    "s3_prefix": f"{prefix}/",
                    "files": files_manifest,
                    "attachment_count": attachment_count,
                    "raw_size_bytes": raw_size,
                    "status": initial_status,
                }
            )
            logger.info(f"DynamoDB entry created: {root_guid} (status={initial_status})")

            # 8. Delete original
            s3.delete_object(Bucket=BUCKET, Key=s3_key)
            logger.info(f"Deleted original: {s3_key}")

            # 9. Run data extraction on PDF attachments (after DynamoDB is logged)
            for file_entry in files_manifest:
                if file_entry.get("type") != "attachment":
                    continue
                fname = file_entry.get("filename", "")
                if not fname.lower().endswith(".pdf"):
                    continue

                logger.info(f"Running extraction on: {fname}")
                att_s3_key = f"{prefix}/{file_entry['sub_guid']}/{fname}"
                att_local = os.path.join(work_dir, f"extract_{fname}")

                try:
                    s3.download_file(BUCKET, att_s3_key, att_local)
                    extracted_data = extract_fields_from_pdf(att_local)

                    if extracted_data:
                        extraction_id = str(uuid.uuid4())
                        extraction_result = {
                            "extraction_id": extraction_id,
                            "email_id": root_guid,
                            "document_id": file_entry["sub_guid"],
                            "s3_uri": f"s3://{BUCKET}/{att_s3_key}",
                            "s3_key": att_s3_key,
                            "bucket": BUCKET,
                            "extraction_fields": DEFAULT_FIELDS,
                            "extracted_data": extracted_data,
                            "status": "pending_review",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "document_name": fname,
                        }

                        ext_key = f"{prefix}/extraction.json"
                        s3.put_object(
                            Bucket=BUCKET,
                            Key=ext_key,
                            Body=json.dumps(extraction_result, indent=2, default=str),
                            ContentType="application/json",
                        )

                        docs_table.put_item(Item={
                            "document_id": extraction_id,
                            "email_id": root_guid,
                            "filename": f"extraction-{fname}",
                            "content_type": "application/json",
                            "size_bytes": len(json.dumps(extraction_result)),
                            "s3_bucket": BUCKET,
                            "s3_key": ext_key,
                            "s3_uri": f"s3://{BUCKET}/{ext_key}",
                            "doc_type": "extraction",
                            "source_document_id": file_entry["sub_guid"],
                            "field_count": len(extracted_data),
                            "status": "pending_review",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                        })

                        logger.info(f"Extraction complete: {len(extracted_data)} fields → {ext_key}")
                except Exception as e:
                    logger.error(f"Extraction failed for {fname}: {e}")

            # 10. Update DynamoDB status to "processed" after extraction
            if has_pdf_attachments:
                table.update_item(
                    Key={"email_id": root_guid},
                    UpdateExpression="SET #s = :s",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":s": "processed"},
                )
                logger.info(f"Updated status to processed: {root_guid}")

        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    return {"statusCode": 200, "body": f"Processed {len(event['Records'])} email(s)"}
