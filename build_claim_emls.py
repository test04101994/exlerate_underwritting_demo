#!/usr/bin/env python3
"""
Build one .eml per claim folder from a raw-email .bin plus its sibling files.

For each claim folder under S3_PREFIX:
  - find the .bin file (raw email content)
  - if there is EXACTLY ONE .bin -> parse it as an email, attach every other
    file in the folder as an attachment, and write <claim_no>.eml locally
  - 0 .bin or >1 .bin  -> skip and record it in the report CSV

If the .bin does not look like a real RFC822/MIME email, we fall back to a
fresh email whose body is the raw .bin content, and still attach the rest.

CONFIG — all via environment variables:
  S3_BUCKET        (required) bucket name
  S3_PREFIX        (required) prefix holding the claim folders, e.g. path/to/root/
  EML_OUT_DIR      (optional) local output dir for .eml files   [default: eml_out]
  EML_LIMIT        (optional) max claims to process; 0 = all     [default: 10]
  EML_REPORT       (optional) report CSV path             [default: eml_report.csv]
  AWS_PROFILE / AWS_REGION / S3_ENDPOINT_URL  (optional)

HOW TO USE:
  export S3_BUCKET=my-bucket
  export S3_PREFIX=path/to/root/
  export EML_LIMIT=10          # test on 10 first; set 0 for the full run
  python3 build_claim_emls.py
"""
import csv
import mimetypes
import os
import sys
from email import message_from_bytes
from email.message import EmailMessage
from email.policy import default as default_policy

import boto3
from botocore.config import Config

# ----- config from environment -----
BUCKET = os.environ.get("S3_BUCKET")
PREFIX = os.environ.get("S3_PREFIX", "")
OUT_DIR = os.environ.get("EML_OUT_DIR", "eml_out")
LIMIT = int(os.environ.get("EML_LIMIT", "10"))      # 0 = no limit
REPORT = os.environ.get("EML_REPORT", "eml_report.csv")
AWS_PROFILE = os.environ.get("AWS_PROFILE")
AWS_REGION = os.environ.get("AWS_REGION")
ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL")

BIN_EXT = ".bin"


def make_client():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.client(
        "s3",
        endpoint_url=ENDPOINT_URL,
        config=Config(retries={"max_attempts": 10, "mode": "adaptive"}),
    )


def iter_claim_prefixes(s3, bucket, prefix):
    """Yield each claim folder prefix (top-level child of PREFIX) via delimiter
    listing — so we only touch the claims we actually process."""
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix, Delimiter="/"):
        for cp in page.get("CommonPrefixes", []):
            yield cp["Prefix"]            # e.g. path/to/root/CLAIM123/


def list_files(s3, bucket, claim_prefix):
    """All real files (recursive) under one claim prefix -> [(key, size)]."""
    out = []
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=claim_prefix):
        for obj in page.get("Contents", []):
            key, size = obj["Key"], obj["Size"]
            if key.endswith("/") and size == 0:
                continue                   # folder-marker object
            out.append((key, size))
    return out


def looks_like_email(msg):
    """Heuristic: a real RFC822 message has headers and/or a MIME structure."""
    if msg.is_multipart():
        return True
    common = ("from", "to", "subject", "date", "message-id", "cc")
    keys = {k.lower() for k in msg.keys()}
    return any(h in keys for h in common)


def build_email(bin_bytes, claim_no):
    """Return an EmailMessage parsed from the .bin, or a fallback wrapper."""
    try:
        msg = message_from_bytes(bin_bytes, policy=default_policy)
        if isinstance(msg, EmailMessage) and looks_like_email(msg):
            return msg, "parsed"
    except Exception:
        pass
    # Fallback: raw content becomes the body.
    msg = EmailMessage()
    msg["Subject"] = f"Claim {claim_no} (raw .bin, unparsed)"
    msg.set_content(bin_bytes.decode("utf-8", errors="replace"))
    return msg, "fallback"


def attach_file(msg, data, filename):
    ctype, _ = mimetypes.guess_type(filename)
    maintype, _, subtype = (ctype or "application/octet-stream").partition("/")
    msg.add_attachment(data, maintype=maintype, subtype=subtype or "octet-stream",
                       filename=filename)


def process_claim(s3, bucket, claim_prefix, out_dir):
    """Build one claim's .eml. Returns a report dict."""
    claim_no = claim_prefix.rstrip("/").rsplit("/", 1)[-1]
    files = list_files(s3, bucket, claim_prefix)
    bins = [(k, sz) for (k, sz) in files if k.lower().endswith(BIN_EXT)]
    rec = {"claim_no": claim_no, "n_files": len(files), "n_bin": len(bins),
           "n_attachments": 0, "status": "", "detail": ""}

    if len(bins) == 0:
        rec["status"] = "skipped_no_bin"
        return rec
    if len(bins) > 1:
        rec["status"] = "skipped_multi_bin"
        rec["detail"] = "; ".join(k for k, _ in bins)
        return rec

    bin_key = bins[0][0]
    bin_bytes = s3.get_object(Bucket=bucket, Key=bin_key)["Body"].read()
    msg, mode = build_email(bin_bytes, claim_no)

    n_attach = 0
    for key, _ in files:
        if key == bin_key:
            continue
        filename = key.rsplit("/", 1)[-1]  # just the file's basename
        data = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        attach_file(msg, data, filename)
        n_attach += 1

    os.makedirs(out_dir, exist_ok=True)
    eml_path = os.path.join(out_dir, f"{claim_no}.eml")
    with open(eml_path, "wb") as f:
        f.write(msg.as_bytes())

    rec["n_attachments"] = n_attach
    rec["status"] = f"written_{mode}"      # written_parsed | written_fallback
    rec["detail"] = eml_path
    return rec


def main():
    if not BUCKET:
        sys.exit("ERROR: set S3_BUCKET (and S3_PREFIX) env vars. e.g.\n"
                 "  export S3_BUCKET=my-bucket\n  export S3_PREFIX=path/to/root/")
    prefix = PREFIX
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    s3 = make_client()
    print(f"Enumerating claim folders under s3://{BUCKET}/{prefix} ...",
          file=sys.stderr)
    if LIMIT:
        print(f"(test mode: processing at most {LIMIT} claims; set EML_LIMIT=0 "
              f"for all)", file=sys.stderr)

    records = []
    processed = 0
    written = 0
    for claim_prefix in iter_claim_prefixes(s3, BUCKET, prefix):
        try:
            rec = process_claim(s3, BUCKET, claim_prefix, OUT_DIR)
        except Exception as e:
            rec = {"claim_no": claim_prefix.rstrip("/").rsplit("/", 1)[-1],
                   "n_files": "", "n_bin": "", "n_attachments": "",
                   "status": "error", "detail": repr(e)}
        records.append(rec)
        processed += 1
        if rec["status"].startswith("written"):
            written += 1
            print(f"  [{written}] {rec['claim_no']}.eml  "
                  f"({rec['n_attachments']} attachments, {rec['status']})",
                  file=sys.stderr)
        if LIMIT and written >= LIMIT:
            print(f"Reached EML_LIMIT={LIMIT}; stopping.", file=sys.stderr)
            break

    with open(REPORT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["claim_no", "n_files", "n_bin",
                                          "n_attachments", "status", "detail"])
        w.writeheader()
        w.writerows(records)

    print("\n=== SUMMARY ===")
    print(f"Claims examined : {processed}")
    print(f"EMLs written    : {written}  -> {OUT_DIR}/")
    counts = {}
    for r in records:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    for status, n in sorted(counts.items()):
        print(f"  {status:<20} {n}")
    print(f"Report          : {REPORT}")


if __name__ == "__main__":
    main()
