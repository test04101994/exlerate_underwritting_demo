"""
EDA script for Prod_Samples directory.

Walks every folder under the script's location, skipping any folder named
'Transactional' and any hidden folder (name starting with '.').

Excel output sheets:
  - Summary               top-line metrics
  - By Base Folder        per top-level folder rollup
  - By Folder             per-folder file counts, with one column per
                          file extension (created dynamically)
  - Format Frequency      overall count of every distinct extension
  - PDF Details           one row per PDF: size, pages, scanned/readable
  - PDF By Folder         per-folder PDF aggregates: count, total/avg/max
                          size and page count, scanned vs readable counts
  - Email Timeline        one row per .msg / .eml file with date received,
                          sender, and subject — sorted oldest to newest
                          within each folder

Run from inside the Prod_Samples folder:
    python3 eda_directory.py
"""

import os
from collections import Counter
from pathlib import Path

import pandas as pd

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None

try:
    import extract_msg  # .msg (Outlook) parsing
except ImportError:  # pragma: no cover
    extract_msg = None

import email
from email import policy
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

SKIP_DIR_NAMES = {"Transactional"}
TRANSACTIONAL_DIR_NAME = "Transactional"
TRANSACTIONAL_OUTPUT_NAME = "Transactional_Consolidated.xlsx"
EXCEL_EXTS = {".xlsx", ".xls", ".xlsm"}
EXCEL_SHEET_FORBIDDEN = set(r"[]:*?/\\")
EXCEL_SHEET_MAX = 31
IGNORED_FILES = {".DS_Store"}
SCRIPT_PATH = Path(__file__).resolve()
ROOT = SCRIPT_PATH.parent
OUTPUT_FILE = ROOT / f"{ROOT.name}_EDA.xlsx"

# A page counts as "has text" if it yields more than this many non-whitespace
# characters from a plain text extraction. Tuned low so even sparse pages
# (e.g. a header + page number) count as readable rather than scanned.
PAGE_TEXT_MIN_CHARS = 20


def collect_folder_stats(root: Path):
    rows = []
    overall_ext = Counter()
    total_files = 0
    total_folders = 0
    pdf_paths = []  # absolute paths of every PDF discovered
    email_paths = []  # absolute paths of every .msg / .eml discovered

    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)

        # Prune skipped folders so os.walk doesn't descend into them.
        # Also skip any hidden folder (.claude, .git, .vscode, etc.).
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIR_NAMES and not d.startswith(".")
        ]

        if current == root:
            continue

        if current.name in SKIP_DIR_NAMES or current.name.startswith("."):
            continue
        if any(part.startswith(".") for part in current.relative_to(root).parts):
            continue

        files = [
            f for f in filenames
            if f not in IGNORED_FILES
            and Path(dirpath, f).resolve() != SCRIPT_PATH
            and Path(dirpath, f).resolve() != OUTPUT_FILE
        ]

        if not files:
            continue

        rel = current.relative_to(root)
        base_folder = rel.parts[0]

        ext_counts = Counter()
        for f in files:
            ext = Path(f).suffix.lower() or "(no extension)"
            ext_counts[ext] += 1
            if ext == ".pdf":
                pdf_paths.append(Path(dirpath, f))
            elif ext in (".msg", ".eml"):
                email_paths.append(Path(dirpath, f))

        rows.append({
            "Base Folder": base_folder,
            "Folder": str(rel),
            "Total Files": len(files),
            "Unique Format Count": len(ext_counts),
            "_ext_counts": dict(ext_counts),
        })

        overall_ext.update(ext_counts)
        total_files += len(files)
        total_folders += 1

    return rows, overall_ext, total_files, total_folders, pdf_paths, email_paths


def analyze_pdf(path: Path, root: Path) -> dict:
    """Return a dict of metrics for a single PDF."""
    rel = path.relative_to(root)
    base_folder = rel.parts[0]
    folder = str(rel.parent)
    size_bytes = path.stat().st_size

    record = {
        "Base Folder": base_folder,
        "Folder": folder,
        "File": path.name,
        "Size (MB)": round(size_bytes / (1024 * 1024), 3),
        "Size (bytes)": size_bytes,
        "Pages": None,
        "Pages With Text": None,
        "Pages Without Text": None,
        "Total Text Chars": None,
        "Avg Chars/Page": None,
        "Classification": None,
        "Encrypted": False,
        "Error": "",
    }

    if fitz is None:
        record["Error"] = "PyMuPDF not installed"
        record["Classification"] = "Unknown"
        return record

    try:
        doc = fitz.open(path)
    except Exception as e:
        record["Error"] = f"open failed: {e}"
        record["Classification"] = "Error"
        return record

    try:
        if doc.is_encrypted:
            # Try empty password; many PDFs are flagged encrypted but openable.
            if not doc.authenticate(""):
                record["Encrypted"] = True
                record["Pages"] = doc.page_count
                record["Classification"] = "Encrypted"
                return record
            record["Encrypted"] = True

        page_count = doc.page_count
        record["Pages"] = page_count

        if page_count == 0:
            record["Classification"] = "Empty"
            record["Pages With Text"] = 0
            record["Pages Without Text"] = 0
            record["Total Text Chars"] = 0
            record["Avg Chars/Page"] = 0
            return record

        total_chars = 0
        text_pages = 0
        for page in doc:
            try:
                text = page.get_text("text") or ""
            except Exception:
                text = ""
            stripped = text.strip()
            total_chars += len(stripped)
            if len(stripped) >= PAGE_TEXT_MIN_CHARS:
                text_pages += 1

        scan_pages = page_count - text_pages
        record["Pages With Text"] = text_pages
        record["Pages Without Text"] = scan_pages
        record["Total Text Chars"] = total_chars
        record["Avg Chars/Page"] = round(total_chars / page_count, 1)

        if text_pages == page_count:
            record["Classification"] = "Readable"
        elif text_pages == 0:
            record["Classification"] = "Scanned"
        else:
            record["Classification"] = "Mixed"

    finally:
        doc.close()

    return record


def _safe_sheet_name(name: str, used: set[str]) -> str:
    """Excel sheet names: <=31 chars, no []:*?/\\, must be unique."""
    cleaned = "".join("_" if c in EXCEL_SHEET_FORBIDDEN else c for c in name).strip()
    if not cleaned:
        cleaned = "sheet"
    cleaned = cleaned[:EXCEL_SHEET_MAX]
    base = cleaned
    i = 2
    while cleaned in used:
        suffix = f"_{i}"
        cleaned = (base[: EXCEL_SHEET_MAX - len(suffix)]) + suffix
        i += 1
    used.add(cleaned)
    return cleaned


def consolidate_transactional(root: Path) -> list[dict]:
    """For each Transactional folder under root, build a consolidated workbook
    containing every Excel file inside it as its own sheet (sheet name = source
    file name, with a per-sheet suffix if the source has multiple sheets).

    Returns a list of summary dicts (one per Transactional folder processed).
    """
    summaries = []

    for dirpath, dirnames, filenames in os.walk(root):
        # Don't descend further; we only act when we hit a Transactional folder.
        # (We still want to find Transactional folders nested anywhere.)
        current = Path(dirpath)
        if current.name != TRANSACTIONAL_DIR_NAME:
            continue

        # Collect Excel files in this Transactional folder (recursively, in case
        # there are subfolders of Excels — sheet names get path-prefixed).
        excel_files: list[Path] = []
        for sub_dirpath, _sub_dirnames, sub_filenames in os.walk(current):
            for fn in sub_filenames:
                if Path(fn).suffix.lower() in EXCEL_EXTS and fn != TRANSACTIONAL_OUTPUT_NAME:
                    excel_files.append(Path(sub_dirpath, fn))
        excel_files.sort()

        if not excel_files:
            continue

        out_path = current / TRANSACTIONAL_OUTPUT_NAME
        used_names: set[str] = set()
        sheets_written = 0
        errors: list[str] = []

        with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
            for src in excel_files:
                try:
                    sheets = pd.read_excel(src, sheet_name=None)  # dict[name, df]
                except Exception as e:
                    errors.append(f"{src.name}: read failed — {e}")
                    continue

                stem = src.stem  # filename without extension
                if len(sheets) == 1:
                    candidates = [(stem, next(iter(sheets.values())))]
                else:
                    candidates = [(f"{stem}__{sn}", df) for sn, df in sheets.items()]

                for proposed, df in candidates:
                    sheet_name = _safe_sheet_name(proposed, used_names)
                    try:
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
                        sheets_written += 1
                    except Exception as e:
                        errors.append(f"{src.name} -> {sheet_name}: write failed — {e}")

        summaries.append({
            "Transactional Folder": str(current.relative_to(root)),
            "Source Files": len(excel_files),
            "Sheets Written": sheets_written,
            "Output": str(out_path.relative_to(root)),
            "Errors": "; ".join(errors) if errors else "",
        })

    return summaries


def _coerce_dt(value) -> datetime | None:
    """Best-effort conversion of an arbitrary date value to an aware datetime."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        if dt is None:
            return None
    else:
        return None
    # Normalize to UTC-aware so sorts compare cleanly.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def analyze_email(path: Path, root: Path) -> dict:
    """Return a dict with metadata for a single .msg or .eml file."""
    rel = path.relative_to(root)
    base_folder = rel.parts[0]
    folder = str(rel.parent)
    ext = path.suffix.lower()
    size_bytes = path.stat().st_size

    record = {
        "Base Folder": base_folder,
        "Folder": folder,
        "File": path.name,
        "Type": ext.lstrip("."),
        "Date Received": None,
        "Date Received (raw)": "",
        "From": "",
        "To": "",
        "Subject": "",
        "Has Attachments": False,
        "Size (KB)": round(size_bytes / 1024, 2),
        "Error": "",
    }

    try:
        if ext == ".eml":
            with open(path, "rb") as f:
                msg = email.message_from_binary_file(f, policy=policy.default)
            date_raw = msg.get("Date", "") or ""
            record["Date Received (raw)"] = date_raw
            record["Date Received"] = _coerce_dt(date_raw)
            record["From"] = str(msg.get("From", "") or "")
            record["To"] = str(msg.get("To", "") or "")
            record["Subject"] = str(msg.get("Subject", "") or "")
            record["Has Attachments"] = any(
                part.get_filename() for part in msg.walk()
            )

        elif ext == ".msg":
            if extract_msg is None:
                record["Error"] = "extract-msg not installed"
                return record
            m = extract_msg.openMsg(str(path))
            try:
                date_val = getattr(m, "date", None)
                record["Date Received (raw)"] = str(date_val) if date_val else ""
                record["Date Received"] = _coerce_dt(date_val)
                record["From"] = (getattr(m, "sender", "") or "") or ""
                record["To"] = (getattr(m, "to", "") or "") or ""
                record["Subject"] = (getattr(m, "subject", "") or "") or ""
                record["Has Attachments"] = bool(getattr(m, "attachments", []))
            finally:
                m.close()
        else:
            record["Error"] = f"unsupported extension {ext}"

    except Exception as e:
        record["Error"] = f"parse failed: {e}"

    return record


def build_email_timeline(records: list[dict]) -> pd.DataFrame:
    """Sorted-by-folder, oldest-to-newest table. Undated rows go last per folder."""
    if not records:
        return pd.DataFrame()
    df = pd.DataFrame(records)

    # Stable secondary key: undated rows pushed to the bottom of each folder.
    far_future = datetime(9999, 12, 31, tzinfo=timezone.utc)
    df["_sort_key"] = df["Date Received"].apply(lambda d: d if isinstance(d, datetime) else far_future)
    df = df.sort_values(["Base Folder", "Folder", "_sort_key", "File"]).drop(columns=["_sort_key"])

    # Render Date Received as ISO string for Excel readability.
    df["Date Received"] = df["Date Received"].apply(
        lambda d: d.isoformat() if isinstance(d, datetime) else ""
    )
    return df.reset_index(drop=True)


def build_pdf_folder_rollup(df_pdf: pd.DataFrame) -> pd.DataFrame:
    """Aggregate per-folder PDF stats: counts, sizes, pages, classification mix."""
    if df_pdf.empty:
        return pd.DataFrame()

    grouped = df_pdf.groupby(["Base Folder", "Folder"])
    rollup = grouped.agg(
        PDF_Count=("File", "count"),
        Total_Size_MB=("Size (MB)", "sum"),
        Avg_Size_MB=("Size (MB)", "mean"),
        Max_Size_MB=("Size (MB)", "max"),
        Min_Size_MB=("Size (MB)", "min"),
        Total_Pages=("Pages", "sum"),
        Avg_Pages=("Pages", "mean"),
        Max_Pages=("Pages", "max"),
        Min_Pages=("Pages", "min"),
    ).reset_index()

    # Classification breakdown — one count column per class observed.
    class_counts = (
        df_pdf.groupby(["Base Folder", "Folder", "Classification"])
        .size()
        .unstack(fill_value=0)
        .reset_index()
    )
    rollup = rollup.merge(class_counts, on=["Base Folder", "Folder"], how="left")

    # Round float columns for readability.
    for col in ["Total_Size_MB", "Avg_Size_MB", "Max_Size_MB", "Min_Size_MB", "Avg_Pages"]:
        if col in rollup.columns:
            rollup[col] = rollup[col].round(3)

    return rollup


def main():
    rows, overall_ext, total_files, total_folders, pdf_paths, email_paths = collect_folder_stats(ROOT)

    if not rows:
        print("No files found (after skipping Transactional folders).")
        return

    ext_columns = [ext for ext, _ in overall_ext.most_common()]

    expanded = []
    for r in rows:
        ext_counts = r.pop("_ext_counts")
        for ext in ext_columns:
            r[ext] = ext_counts.get(ext, 0)
        expanded.append(r)

    base_cols = ["Base Folder", "Folder", "Total Files", "Unique Format Count"]
    df_folders = (
        pd.DataFrame(expanded, columns=base_cols + ext_columns)
        .sort_values(["Base Folder", "Folder"])
        .reset_index(drop=True)
    )

    rollup = (
        df_folders.groupby("Base Folder")
        .agg(
            Folders_With_Files=("Folder", "count"),
            Total_Files=("Total Files", "sum"),
        )
        .reset_index()
    )

    df_formats = pd.DataFrame(
        sorted(overall_ext.items(), key=lambda kv: (-kv[1], kv[0])),
        columns=["File Format", "Count"],
    )

    # ---- PDF deep analysis ----
    pdf_records = []
    if pdf_paths:
        print(f"Analyzing {len(pdf_paths)} PDF file(s)...")
        for i, p in enumerate(pdf_paths, 1):
            pdf_records.append(analyze_pdf(p, ROOT))
            if i % 25 == 0 or i == len(pdf_paths):
                print(f"  {i}/{len(pdf_paths)}")

    df_pdf = pd.DataFrame(pdf_records)
    df_pdf_rollup = build_pdf_folder_rollup(df_pdf) if not df_pdf.empty else pd.DataFrame()

    # ---- Email (.msg / .eml) analysis ----
    email_records = []
    if email_paths:
        print(f"Analyzing {len(email_paths)} email file(s)...")
        for i, p in enumerate(email_paths, 1):
            email_records.append(analyze_email(p, ROOT))
            if i % 25 == 0 or i == len(email_paths):
                print(f"  {i}/{len(email_paths)}")

    df_emails = build_email_timeline(email_records)

    # ---- Transactional consolidation ----
    transactional_summaries = consolidate_transactional(ROOT)
    df_transactional = pd.DataFrame(transactional_summaries)

    # ---- Summary sheet ----
    summary_rows = [
        {"Metric": "Root scanned", "Value": str(ROOT)},
        {"Metric": "Folders skipped", "Value": ", ".join(sorted(SKIP_DIR_NAMES)) + ", hidden (.*)"},
        {"Metric": "Total folders with files", "Value": total_folders},
        {"Metric": "Total files", "Value": total_files},
        {"Metric": "Distinct file formats", "Value": len(overall_ext)},
    ]
    if not df_pdf.empty:
        cls_counts = df_pdf["Classification"].value_counts().to_dict()
        summary_rows.extend([
            {"Metric": "PDF files", "Value": len(df_pdf)},
            {"Metric": "PDF total size (MB)", "Value": round(df_pdf["Size (MB)"].sum(), 3)},
            {"Metric": "PDF avg size (MB)", "Value": round(df_pdf["Size (MB)"].mean(), 3)},
            {"Metric": "PDF max size (MB)", "Value": round(df_pdf["Size (MB)"].max(), 3)},
            {"Metric": "PDF total pages", "Value": int(df_pdf["Pages"].fillna(0).sum())},
            {"Metric": "PDF avg pages", "Value": round(df_pdf["Pages"].dropna().mean(), 1) if df_pdf["Pages"].notna().any() else 0},
            {"Metric": "PDF max pages", "Value": int(df_pdf["Pages"].dropna().max()) if df_pdf["Pages"].notna().any() else 0},
            {"Metric": "PDF classification mix", "Value": ", ".join(f"{k}: {v}" for k, v in sorted(cls_counts.items()))},
        ])
    if not df_emails.empty:
        type_counts = df_emails["Type"].value_counts().to_dict()
        summary_rows.extend([
            {"Metric": "Email files", "Value": len(df_emails)},
            {"Metric": "Email mix", "Value": ", ".join(f".{k}: {v}" for k, v in sorted(type_counts.items()))},
            {"Metric": "Emails with date parsed", "Value": int((df_emails["Date Received"] != "").sum())},
        ])
    if transactional_summaries:
        summary_rows.extend([
            {"Metric": "Transactional folders consolidated", "Value": len(transactional_summaries)},
            {"Metric": "Transactional source files", "Value": sum(s["Source Files"] for s in transactional_summaries)},
            {"Metric": "Transactional sheets written", "Value": sum(s["Sheets Written"] for s in transactional_summaries)},
        ])

    df_summary = pd.DataFrame(summary_rows)

    with pd.ExcelWriter(OUTPUT_FILE, engine="openpyxl") as writer:
        df_summary.to_excel(writer, sheet_name="Summary", index=False)
        rollup.to_excel(writer, sheet_name="By Base Folder", index=False)
        df_folders.to_excel(writer, sheet_name="By Folder", index=False)
        df_formats.to_excel(writer, sheet_name="Format Frequency", index=False)
        if not df_pdf.empty:
            df_pdf.sort_values(["Base Folder", "Folder", "File"]).to_excel(
                writer, sheet_name="PDF Details", index=False
            )
            df_pdf_rollup.to_excel(writer, sheet_name="PDF By Folder", index=False)
        if not df_emails.empty:
            df_emails.to_excel(writer, sheet_name="Email Timeline", index=False)
        if not df_transactional.empty:
            df_transactional.to_excel(writer, sheet_name="Transactional Consolidation", index=False)

    print(f"Wrote {OUTPUT_FILE}")
    print(f"  Folders summarized: {total_folders}")
    print(f"  Total files:        {total_files}")
    print(f"  Distinct formats:   {len(overall_ext)}")
    print(f"  PDFs analyzed:      {len(df_pdf)}")
    print(f"  Emails analyzed:    {len(df_emails)}")
    if transactional_summaries:
        print(f"  Transactional consolidated workbooks:")
        for s in transactional_summaries:
            print(f"    - {s['Output']}  ({s['Sheets Written']} sheet(s) from {s['Source Files']} file(s))")


if __name__ == "__main__":
    main()
