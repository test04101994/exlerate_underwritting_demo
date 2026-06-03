#!/usr/bin/env python3
"""
S3 folder EDA.

Scans an S3 prefix that contains many "folders" (e.g. ~140k) and reports, per
folder:
  - total file count
  - total bytes
  - file count broken down by extension/format

Design note: S3 has no real folders, just keys. Listing each folder separately
would be 140k+ API calls. Instead this does ONE flat paginated sweep of the
whole prefix (1000 keys/call) and aggregates in memory. Fast and cheap.

CONFIG — all via environment variables (no config file to edit):

  S3_BUCKET        (required) bucket name
  S3_PREFIX        (required) prefix holding the claim folders, e.g. path/to/root/
  S3_OUT_PREFIX    (optional) output CSV filename prefix          [default: s3_eda]
  AWS_PROFILE      (optional) named AWS profile
  AWS_REGION       (optional) region, e.g. us-east-1
  S3_ENDPOINT_URL  (optional) custom S3 endpoint (e.g. MinIO)

HOW TO USE:
  export S3_BUCKET=my-bucket
  export S3_PREFIX=path/to/root/
  aws s3 ls s3://$S3_BUCKET/$S3_PREFIX | head   # confirm access
  python3 s3_folder_eda.py

Every file is counted under its top-level folder (first segment after S3_PREFIX,
i.e. the claim number). Files in sub-folders roll up to that same claim.
"""
import csv
import os
import sys
from collections import defaultdict

import boto3
from botocore.config import Config

# ----- config read from environment variables -----
BUCKET = os.environ.get("S3_BUCKET")
PREFIX = os.environ.get("S3_PREFIX", "")
OUT_PREFIX = os.environ.get("S3_OUT_PREFIX", "s3_eda")
AWS_PROFILE = os.environ.get("AWS_PROFILE")          # boto3 also reads this natively
AWS_REGION = os.environ.get("AWS_REGION")            # boto3 also reads this natively
ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL")


def make_client():
    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return session.client(
        "s3",
        endpoint_url=ENDPOINT_URL,
        config=Config(retries={"max_attempts": 10, "mode": "adaptive"}),
    )


def folder_key(rel_key):
    """Top-level folder a key belongs to, given the key relative to PREFIX.

    Always the first path segment, so files in any sub-folder roll up to their
    top-level folder. A file sitting directly in PREFIX (no sub-folder) is
    bucketed under "<root>".
    """
    parts = rel_key.split("/", 1)
    if len(parts) < 2:
        return "<root>"
    return parts[0]


def extension(key):
    """Lowercase file extension, or '<none>' if there isn't one."""
    name = key.rsplit("/", 1)[-1]
    if not name:
        return "<none>"          # key ended in "/" (a folder-marker object)
    _, ext = os.path.splitext(name)
    return ext.lower() if ext else "<none>"


def scan(s3, bucket, prefix):
    """One paginated sweep of the prefix. Returns aggregated stats."""
    folder_count = defaultdict(int)
    folder_bytes = defaultdict(int)
    folder_fmt_count = defaultdict(lambda: defaultdict(int))
    folder_fmt_bytes = defaultdict(lambda: defaultdict(int))
    fmt_count = defaultdict(int)
    fmt_bytes = defaultdict(int)
    total_objects = 0

    paginator = s3.get_paginator("list_objects_v2")
    print(f"Scanning s3://{bucket}/{prefix} ...", file=sys.stderr)

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            size = obj["Size"]
            rel = key[len(prefix):] if prefix else key
            if rel == "":
                continue  # the prefix placeholder object itself
            if key.endswith("/") and size == 0:
                continue  # zero-byte folder-marker object

            folder = folder_key(rel)
            ext = extension(key)

            folder_count[folder] += 1
            folder_bytes[folder] += size
            folder_fmt_count[folder][ext] += 1
            folder_fmt_bytes[folder][ext] += size
            fmt_count[ext] += 1
            fmt_bytes[ext] += size

            total_objects += 1
            if total_objects % 100_000 == 0:
                print(f"  ...{total_objects:,} objects, "
                      f"{len(folder_count):,} folders so far", file=sys.stderr)

    print(f"Done: {total_objects:,} files across {len(folder_count):,} folders.",
          file=sys.stderr)
    return {
        "total_objects": total_objects,
        "folder_count": folder_count,
        "folder_bytes": folder_bytes,
        "folder_fmt_count": folder_fmt_count,
        "folder_fmt_bytes": folder_fmt_bytes,
        "fmt_count": fmt_count,
        "fmt_bytes": fmt_bytes,
    }


def write_folder_summary(stats, out_prefix):
    path = f"{out_prefix}_folder_summary.csv"
    fc, fb = stats["folder_count"], stats["folder_bytes"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["claim_no", "file_count", "total_bytes", "total_mb"])
        for folder in sorted(fc, key=lambda k: fc[k], reverse=True):
            w.writerow([folder, fc[folder], fb[folder], round(fb[folder] / 1_048_576, 3)])
    return path


def write_folder_by_format(stats, out_prefix):
    path = f"{out_prefix}_folder_by_format.csv"
    ffc, ffb = stats["folder_fmt_count"], stats["folder_fmt_bytes"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["claim_no", "extension", "file_count", "total_bytes"])
        for folder in sorted(ffc):
            for ext in sorted(ffc[folder], key=lambda e: ffc[folder][e], reverse=True):
                w.writerow([folder, ext, ffc[folder][ext], ffb[folder][ext]])
    return path


def write_format_totals(stats, out_prefix):
    path = f"{out_prefix}_format_totals.csv"
    fc, fb = stats["fmt_count"], stats["fmt_bytes"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["extension", "file_count", "total_bytes", "total_mb"])
        for ext in sorted(fc, key=lambda e: fc[e], reverse=True):
            w.writerow([ext, fc[ext], fb[ext], round(fb[ext] / 1_048_576, 3)])
    return path


def print_summary(stats, paths):
    fc = stats["fmt_count"]
    fb = stats["fmt_bytes"]
    folders = len(stats["folder_count"]) or 1
    total = stats["total_objects"]
    print("\n=== SUMMARY ===")
    print(f"Files total      : {total:,}")
    print(f"Folders total    : {len(stats['folder_count']):,}")
    print(f"Avg files/folder : {total / folders:.1f}")
    print(f"Total size       : {sum(fb.values()) / 1_073_741_824:.2f} GB")
    print("\nTop formats (whole prefix):")
    for ext in sorted(fc, key=lambda e: fc[e], reverse=True)[:15]:
        print(f"  {ext:>12}  {fc[ext]:>12,} files  {fb[ext] / 1_048_576:>12,.1f} MB")
    print("\nWrote:")
    for p in paths:
        print(f"  {p}")


def main():
    if not BUCKET:
        sys.exit("ERROR: set the S3_BUCKET environment variable "
                 "(and S3_PREFIX). e.g.\n"
                 "  export S3_BUCKET=my-bucket\n"
                 "  export S3_PREFIX=path/to/root/")
    prefix = PREFIX
    # Normalize: a prefix naming a folder should end in "/" so we don't match
    # sibling prefixes (foo/ vs foobar/).
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    s3 = make_client()
    stats = scan(s3, BUCKET, prefix)
    paths = [
        write_folder_summary(stats, OUT_PREFIX),
        write_folder_by_format(stats, OUT_PREFIX),
        write_format_totals(stats, OUT_PREFIX),
    ]
    print_summary(stats, paths)


if __name__ == "__main__":
    main()
