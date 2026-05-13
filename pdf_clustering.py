"""
PDF Categorization & Clustering — standalone companion to eda_directory.py.

WHAT IT DOES
============
For every readable PDF under the script's directory (skipping `Transactional/`
and hidden folders), this script does TWO independent passes:

  Pass 1 — Rule-based Categorization (supervised, deterministic)
  ---------------------------------------------------------------
  Each PDF is scored against 14 fixed insurance-domain categories using a
  weighted phrase library (CATEGORY_RULES below). The category with the
  highest score wins. Below the minimum score threshold, the document is
  bucketed into "14. Miscellaneous / Unknown".

  The categories cover specialty FNOL flows — D&O, E&O, M&A (R&W),
  Healthcare Management, Medical Malpractice, Environmental, Product
  Recall — through dedicated phrases in Legal & Litigation, Regulatory &
  Compliance, Medical & Injury, Inspection & Assessment, and Financial &
  Damage.

  Pass 2 — KMeans Clustering (unsupervised, data-driven)
  -------------------------------------------------------
  Each PDF's text is vectorised with TF-IDF (1- and 2-grams, English stop
  words removed). KMeans groups the vectors into K clusters where:

      K = clip( round( sqrt(N / 2) ), min=2, max=12 )

  N is the number of READABLE PDFs (text >= MIN_TEXT_CHARS).

      N=2..7   -> K = 2
      N=8..17  -> K = 2..3
      N=18..49 -> K = 3..4
      N=50..200 -> K = 5..10
      N>=288   -> K = 12 (capped)

  Each cluster is labelled by the top 6 terms of its centroid.

  Clusters are NOT the same as your 15 categories. They are emergent
  groupings derived purely from text similarity, used to:

    * surface SUB-TYPES within a category (e.g. two flavours of medical
      reports — admission vs. discharge — would form different clusters
      even though both land in "06. Medical & Injury")
    * highlight LIKELY MIS-CATEGORIZATIONS (a cluster whose dominant
      category disagrees with some of its members)
    * reveal NOVEL DOC TYPES hiding inside "14. Miscellaneous / Unknown"

OUTPUTS
=======
A single Excel file `<RootName>_PDF_Clusters.xlsx` with sheets:

  - Methodology           Plain-English explanation of the two passes
  - Summary               Counts and totals
  - PDF Categorization    One row per PDF: category, score, matched terms,
                          runner-up, cluster ID, cluster top terms
  - Category Counts       Overall count and % per category
  - Category By Folder    Crosstab: rows = base folders, cols = categories
  - Cluster Summary       Per-cluster size, top terms, dominant category,
                          and the category mix inside the cluster
  - Category Rules        The phrase library used (auditable / tunable)

Run:
    python3 pdf_clustering.py
"""

from __future__ import annotations

import argparse
import math
import os
import re
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

try:
    import fitz  # PyMuPDF
except ImportError as e:
    raise SystemExit("PyMuPDF is required. Install with: pip install PyMuPDF") from e

try:
    from sklearn.cluster import KMeans, MiniBatchKMeans
    from sklearn.feature_extraction.text import TfidfVectorizer
except ImportError as e:
    raise SystemExit("scikit-learn is required. Install with: pip install scikit-learn") from e

try:
    from tqdm import tqdm
    _HAS_TQDM = True
except ImportError:  # pragma: no cover
    _HAS_TQDM = False

SCRIPT_PATH = Path(__file__).resolve()
ROOT = SCRIPT_PATH.parent
OUTPUT_FILE = ROOT / f"{ROOT.name}_PDF_Clusters.xlsx"

SKIP_DIR_NAMES = {"Transactional"}
PAGE_TEXT_MIN_CHARS = 20            # per-page threshold for "has text"
MIN_TEXT_CHARS = 100                # per-doc minimum to participate in clustering
MAX_CHARS_PER_DOC = 20_000          # cap how much text we hold in memory per PDF
CATEGORY_MIN_SCORE = 3              # below this -> Miscellaneous / Unknown

# Cluster count bounds — see formula in the file docstring.
K_MIN = 2
K_MAX = 12

# Parallelism + scale knobs.
DEFAULT_WORKERS = max(1, (os.cpu_count() or 4) - 1)  # leave one core free for the OS
CHUNK_SIZE = 8                                       # files per worker dispatch (good for fast PDFs)
MINIBATCH_THRESHOLD = 2_000                          # switch KMeans -> MiniBatchKMeans above this N
MINIBATCH_SIZE = 1024                                # MiniBatchKMeans batch size

# ---------------------------------------------------------------------------
# Category rules. Edit weights or add phrases here — no code changes needed.
# Multi-word phrases are matched as adjacent tokens, case-insensitively, with
# word-boundary anchors so "fire report" won't match "firefighter".
# ---------------------------------------------------------------------------
CATEGORY_RULES = {

    "01. Claim Intake": [
        ("first notice of loss", 10),
        ("fnol", 10),
        ("loss notice", 8),
        ("notice of loss", 8),
        ("claim intake", 7),
        ("new claim setup", 7),
        ("claim notification", 7),
        ("reported date", 4),
        ("date of loss", 4),
        ("cause of loss", 5),
        ("loss location", 4),
        ("insured reported", 4),

        # (ACORD form detection lives in 03. Application & Submission —
        #  all ACORD forms are grouped under one category there.)
        ("automobile loss notice", 9),
        ("property loss notice", 9),
        ("general liability notice", 9),
        ("workers compensation first report", 9),
    ],

    "02. Policy & Coverage": [
        ("declarations page", 10),
        ("policy declarations", 10),
        ("certificate of insurance", 10),
        ("certificate holder", 8),
        ("named insured", 7),
        ("policy number", 6),
        ("policy period", 7),
        ("coverage part", 6),
        ("coverage limits", 7),
        ("limit of liability", 7),
        ("deductible", 5),
        ("endorsement", 6),
        ("binder", 5),
        ("insuring agreement", 8),
        ("policy schedule", 6),
        ("coverage form", 6),
        ("premium", 3),
        ("retroactive date", 5),
        ("effective date", 4),
        # Coverage-position documents (specialty lines)
        ("reservation of rights", 9),
        ("reservation of rights letter", 10),
        ("coverage position", 8),
        ("coverage analysis", 7),
        ("coverage opinion", 7),
        ("denial of coverage", 9),
        ("non-renewal notice", 7),
    ],

    "03. Application & Submission": [
        ("insurance application", 10),
        ("application for insurance", 10),
        ("proposal form", 9),
        ("underwriting submission", 9),
        ("submission form", 8),
        ("supplemental application", 8),
        ("supplemental questionnaire", 8),
        ("statement of values", 6),
        ("applicant information", 6),
        ("nature of business", 5),
        ("risk information", 5),

        # ALL ACORD forms (any form number) are grouped under this category.
        # Matches "ACORD 1", "ACORD 25", "ACORD 125", "ACORD 1430", etc.
        # Case-insensitive, any spacing. Single source of ACORD detection.
        (r"re:\bacord\s+\d{1,4}\b", 10, "ACORD form (any number)"),
        ("commercial insurance application", 9),
    ],

    "04. Incident & Investigation": [
        ("police report", 10),
        ("fire report", 10),
        ("incident report", 9),
        ("investigation report", 8),
        ("adjuster report", 8),
        ("loss adjuster", 7),
        ("scene investigation", 7),
        ("traffic accident report", 8),
        ("crash report", 8),
        ("witness statement", 8),
        ("incident description", 5),
        ("cause investigation", 6),
        ("investigation findings", 6),
        ("root cause", 5),
        # Product recall / quality incidents
        ("recall notice", 10),
        ("product recall", 9),
        ("cpsc report", 9),
        ("cpsc", 6),
        ("product complaint", 7),
        ("product failure", 7),
        ("adverse event report", 9),
        ("incident notification", 7),
        ("near miss", 5),
        ("safety notice", 7),
    ],

    "05. Financial & Damage": [
        ("proof of loss", 10),
        ("repair estimate", 10),
        ("damage estimate", 9),
        ("estimate of damages", 9),
        ("cost of repairs", 8),
        ("body shop estimate", 8),
        ("invoice", 6),
        ("receipt", 5),
        ("valuation report", 7),
        ("replacement cost", 7),
        ("actual cash value", 7),
        ("acv", 6),
        ("rcv", 6),
        ("salvage value", 6),
        ("total loss", 7),
        ("payment summary", 5),
        ("reserve summary", 7),
        # Specialty-line costs
        ("remediation cost", 9),
        ("remediation expense", 9),
        ("recall expense", 9),
        ("recall cost", 9),
        ("business interruption", 9),
        ("defense costs", 7),
        ("indemnity payment", 7),
        ("loss adjustment expense", 6),
        ("lae", 5),
        ("settlement payment", 7),
    ],

    "06. Medical & Injury": [
        ("medical report", 9),
        ("medical records", 8),
        ("treatment records", 8),
        ("hospital discharge", 8),
        ("diagnosis", 6),
        ("bodily injury", 8),
        ("injury description", 7),
        ("independent medical examination", 10),
        ("ime report", 10),
        ("physician notes", 7),
        ("cpt code", 6),
        ("icd", 5),
        ("prescription", 5),
        ("physical therapy", 6),
        ("disability form", 7),
        ("workers compensation injury", 8),
        ("first report of injury", 10),
        # Medical malpractice specialty
        ("medical malpractice", 10),
        ("standard of care", 8),
        ("informed consent", 7),
        ("adverse event", 7),
        ("sentinel event", 9),
        ("never event", 8),
        ("hospital incident report", 8),
    ],

    "07. Legal & Litigation": [
        ("summons", 10),
        ("complaint", 8),
        ("lawsuit", 9),
        ("statement of claim", 9),
        ("demand letter", 10),
        ("settlement agreement", 10),
        ("notice of suit", 9),
        ("subpoena", 9),
        ("litigation", 8),
        ("plaintiff", 7),
        ("defendant", 7),
        ("legal counsel", 6),
        ("attorney correspondence", 8),
        ("law office", 5),
        ("court filing", 7),
        ("statute of limitations", 6),
        # D&O / securities
        ("derivative suit", 10),
        ("derivative action", 10),
        ("shareholder demand", 10),
        ("securities class action", 10),
        ("class action complaint", 9),
        ("class action", 7),
        ("books and records demand", 8),
        # E&O / professional liability
        ("professional liability claim", 9),
        ("malpractice complaint", 9),
        # M&A / R&W
        ("notice of breach", 9),
        ("breach notice", 9),
        ("indemnification claim", 9),
        ("indemnification demand", 9),
        ("breach of representations", 9),
        ("escrow claim", 8),
        # Med mal litigation procedure
        ("affidavit of merit", 10),
        ("certificate of merit", 9),
        ("pre-suit panel", 9),
        ("pre-litigation panel", 9),
        # Procedural litigation
        ("answer to complaint", 7),
        ("motion to dismiss", 7),
        ("tolling agreement", 7),
        ("consent decree", 8),
        ("notice of intent to sue", 9),
    ],

    "08. Supporting Evidence & Media": [
        ("photograph", 7),
        ("photos attached", 7),
        ("damage photos", 8),
        ("video footage", 8),
        ("cctv", 8),
        ("audio recording", 7),
        ("dashcam", 8),
        ("body cam", 7),
        ("surveillance footage", 8),
        ("email thread", 5),
        ("screenshots attached", 6),
        ("attachment included", 3),
    ],

    "09. Inspection & Assessment": [
        ("engineering report", 10),
        ("inspection report", 9),
        ("property inspection", 9),
        ("risk assessment", 8),
        ("loss control survey", 10),
        ("site inspection", 7),
        ("structural assessment", 8),
        ("appraisal report", 8),
        ("roof inspection", 8),
        ("building assessment", 7),
        # Environmental assessments
        ("phase i environmental", 10),
        ("phase ii environmental", 10),
        ("environmental site assessment", 10),
        ("esa report", 8),
        ("remediation plan", 9),
        ("remediation work plan", 9),
        # M&A / R&W due diligence assessments
        ("quality of earnings", 10),
        ("qoe report", 9),
        ("forensic accounting", 8),
        ("financial diligence", 7),
        # Product liability / recall testing
        ("lab test report", 9),
        ("laboratory analysis", 8),
        ("batch testing", 8),
        ("product testing", 7),
        ("expert report", 7),
        ("expert opinion", 7),
    ],

    "10. Regulatory & Compliance": [
        ("know your customer", 10),
        ("kyc", 9),
        ("sanctions check", 10),
        ("ofac", 9),
        ("aml", 8),
        ("anti-money laundering", 9),
        ("pep screening", 9),
        ("due diligence", 7),
        ("regulatory filing", 8),
        ("compliance declaration", 8),
        ("beneficial owner", 6),
        # Securities / financial regulators (D&O)
        ("sec subpoena", 10),
        ("sec investigation", 10),
        ("civil investigative demand", 9),
        ("wells notice", 10),
        # Healthcare regulators (HCMgt, HCMed)
        ("hhs subpoena", 10),
        ("oig investigation", 10),
        ("oig subpoena", 10),
        ("cms audit", 9),
        ("hipaa breach", 10),
        ("hipaa violation", 9),
        ("stark law", 8),
        ("anti-kickback", 8),
        # Environmental regulators (Env)
        ("epa notice", 10),
        ("notice of violation", 9),
        ("cercla", 10),
        ("cercla notice", 10),
        ("rcra", 8),
        ("notice of intent", 7),
        # Consumer / product regulators (ProdRec)
        ("cpsc inquiry", 9),
        ("fda warning letter", 10),
        ("fda 483", 10),
        ("recall classification", 8),
    ],

    "11. Communication": [
        ("dear sir", 5),
        ("dear madam", 5),
        ("kind regards", 4),
        ("yours sincerely", 4),
        ("broker correspondence", 8),
        ("customer correspondence", 8),
        ("notice to insured", 7),
        ("email communication", 6),
        ("memorandum", 5),
    ],

    "12. Internal Operational": [
        ("claim notes", 9),
        ("underwriting notes", 9),
        ("claim diary", 8),
        ("internal memo", 7),
        ("workflow report", 7),
        ("reserve approval", 8),
        ("authority limit", 6),
        ("referral note", 6),
        ("internal use only", 5),
    ],

    "13. Fraud & SIU": [
        ("special investigation unit", 10),
        ("special investigation", 10),
        ("fraud indicator", 9),
        ("fraud referral", 10),
        ("surveillance report", 9),
        ("suspicious activity", 8),
        ("material misrepresentation", 8),
        ("red flag indicator", 7),
        ("claim exaggeration", 7),
        # Whistleblower / qui tam (HCMgt, healthcare fraud)
        ("whistleblower complaint", 10),
        ("whistleblower", 6),
        ("qui tam", 10),
        ("false claims act", 9),
        ("relator complaint", 9),
    ],
}

UNKNOWN_CATEGORY = "14. Miscellaneous / Unknown"


def _compile_category_patterns():
    """Compile each rule into a case-insensitive regex.

    Each rule is a tuple. Two forms are supported:

        (phrase, weight)               -> literal phrase, matched whole-word
        (phrase, weight, display)      -> same, with custom display label

    A phrase that begins with the marker ``re:`` is treated as a RAW regex
    (case-insensitive, no auto word boundaries — author them yourself). This
    lets you collapse families of similar phrases into one rule, e.g.

        ("re:\\bacord\\s+[1-9]\\b",   10, "ACORD 1-9 (FNOL forms)")
        ("re:\\bacord\\s+1\\d{2}\\b", 10, "ACORD 1xx (application forms)")
    """
    compiled = {}
    for cat, terms in CATEGORY_RULES.items():
        compiled[cat] = []
        for term in terms:
            if len(term) == 3:
                raw, weight, display = term
            else:
                raw, weight = term
                display = raw[3:] if raw.startswith("re:") else raw
            if raw.startswith("re:"):
                pattern = raw[3:]
            else:
                tokens = re.escape(raw).split(r"\ ")
                pattern = r"\b" + r"\s+".join(tokens) + r"\b"
            compiled[cat].append((re.compile(pattern, re.IGNORECASE), display, weight))
    return compiled


_COMPILED = _compile_category_patterns()


def find_pdfs(root: Path) -> list[Path]:
    """Walk the tree, skipping Transactional and hidden folders, returning all PDFs."""
    pdfs: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames
            if d not in SKIP_DIR_NAMES and not d.startswith(".")
        ]
        current = Path(dirpath)
        if any(part.startswith(".") for part in current.relative_to(root).parts):
            continue
        for f in filenames:
            if Path(f).suffix.lower() == ".pdf":
                pdfs.append(current / f)
    return pdfs


def extract_pdf_info(path: Path) -> dict:
    """Open the PDF, classify scanned/readable/mixed, and return up to MAX_CHARS_PER_DOC of text."""
    info = {
        "path": str(path),  # str instead of Path: cheaper to pickle across processes
        "pages": 0,
        "classification": "Error",
        "text": "",
        "size_mb": round(path.stat().st_size / (1024 * 1024), 3),
        "error": "",
    }
    try:
        doc = fitz.open(path)
    except Exception as e:
        info["error"] = f"open failed: {e}"
        return info

    try:
        if doc.is_encrypted and not doc.authenticate(""):
            info["classification"] = "Encrypted"
            info["pages"] = doc.page_count
            return info

        info["pages"] = doc.page_count
        if doc.page_count == 0:
            info["classification"] = "Empty"
            return info

        collected: list[str] = []
        remaining = MAX_CHARS_PER_DOC
        text_pages = 0
        for page in doc:
            try:
                t = page.get_text("text") or ""
            except Exception:
                t = ""
            stripped = t.strip()
            if len(stripped) >= PAGE_TEXT_MIN_CHARS:
                text_pages += 1
            if remaining > 0 and stripped:
                chunk = stripped[:remaining]
                collected.append(chunk)
                remaining -= len(chunk)

        info["text"] = "\n".join(collected)
        if text_pages == doc.page_count:
            info["classification"] = "Readable"
        elif text_pages == 0:
            info["classification"] = "Scanned"
        else:
            info["classification"] = "Mixed"
    finally:
        doc.close()
    return info


def process_pdf(path_str: str) -> dict:
    """Worker entry point: extract text AND categorize. Runs inside a worker process.

    Combining the two steps in the worker keeps the per-task payload small
    (we don't ship 20K-char texts back if the doc is scanned, and we never
    ship them twice). Returns a dict that's directly picklable.
    """
    path = Path(path_str)
    info = extract_pdf_info(path)
    if info["classification"] in ("Readable", "Mixed") and info["text"].strip():
        cat = categorize(info["text"])
    else:
        cat = {"category": "N/A (not readable)", "score": 0,
               "matched_terms": "", "runner_up": "", "runner_up_score": 0}
    info.update({f"cat_{k}": v for k, v in cat.items()})
    return info


def categorize(text: str) -> dict:
    """Score `text` against every rule; return winning category + details."""
    if not text or not text.strip():
        return {"category": UNKNOWN_CATEGORY, "score": 0, "matched_terms": "",
                "runner_up": "", "runner_up_score": 0}

    scores: dict[str, int] = {}
    hits: dict[str, list[tuple[str, int]]] = {}
    for cat, rules in _COMPILED.items():
        s = 0
        h: list[tuple[str, int]] = []
        for regex, phrase, weight in rules:
            n = len(regex.findall(text))
            if n:
                contribution = n * weight
                s += contribution
                h.append((phrase, contribution))
        scores[cat] = s
        hits[cat] = sorted(h, key=lambda kv: -kv[1])

    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    top_cat, top_score = ranked[0]
    runner_cat, runner_score = (ranked[1] if len(ranked) > 1 else ("", 0))
    category = top_cat if top_score >= CATEGORY_MIN_SCORE else UNKNOWN_CATEGORY

    return {
        "category": category,
        "score": top_score,
        "matched_terms": ", ".join(f"{p}×{c}" for p, c in hits.get(top_cat, [])[:5]),
        "runner_up": runner_cat if runner_score > 0 else "",
        "runner_up_score": runner_score,
    }


def cluster_documents(texts: list[str]) -> tuple[list[int], list[str], int, str]:
    """TF-IDF + KMeans / MiniBatchKMeans.

    Returns (labels, top-terms-per-cluster, k_used, algorithm_used).

    For N <= MINIBATCH_THRESHOLD we use plain KMeans (slightly higher quality).
    For N > MINIBATCH_THRESHOLD we switch to MiniBatchKMeans — orders of
    magnitude faster on large corpora with minimal quality loss.
    """
    n = len(texts)
    if n < 2:
        return [], [], 0, "none"

    k = max(K_MIN, min(K_MAX, round(math.sqrt(n / 2)) or K_MIN))

    # max_features grows with corpus size (more terms worth keeping when you
    # have more documents) but capped to keep memory bounded.
    max_features = min(20_000, max(5_000, n * 50))

    vec = TfidfVectorizer(
        max_features=max_features,
        ngram_range=(1, 2),
        stop_words="english",
        min_df=2 if n >= 50 else 1,       # drop hapax legomena on bigger corpora
        max_df=0.9,
        sublinear_tf=True,
    )
    try:
        X = vec.fit_transform(texts)
    except ValueError:
        return [], [], 0, "none"

    if X.shape[1] == 0:
        return [], [], 0, "none"
    if X.shape[0] < k:
        k = max(K_MIN, X.shape[0])

    if n > MINIBATCH_THRESHOLD:
        algo = "MiniBatchKMeans"
        km = MiniBatchKMeans(
            n_clusters=k,
            random_state=42,
            n_init=5,
            batch_size=MINIBATCH_SIZE,
            max_iter=200,
            reassignment_ratio=0.01,
        )
    else:
        algo = "KMeans"
        km = KMeans(n_clusters=k, n_init=10, random_state=42)

    labels = km.fit_predict(X).tolist()

    terms = vec.get_feature_names_out()
    cluster_top_terms = []
    centers = km.cluster_centers_
    for c in range(k):
        centroid = centers[c]
        top_idx = centroid.argsort()[::-1][:6]
        cluster_top_terms.append(", ".join(terms[j] for j in top_idx if centroid[j] > 0))

    return labels, cluster_top_terms, k, algo


def methodology_text(n_readable: int, k_used: int, algo: str, workers: int) -> pd.DataFrame:
    rows = [
        ("Step 1: Discover PDFs",
         "Walk every folder under the script location, skipping 'Transactional/' and hidden folders. Collect every *.pdf."),
        ("Step 2: Parallel PDF processing (PyMuPDF / fitz)",
         f"Open each PDF in a worker process pool (this run: {workers} workers). Each worker extracts page-level text, classifies the PDF (Readable / Scanned / Mixed / Empty / Encrypted), and scores it against the rule library in one shot. PDF parsing is embarrassingly parallel, so wall time scales close to linearly with worker count."),
        ("Step 3: Rule-based categorization (Pass 1)",
         "Score the document text against the 14 fixed categories using a weighted phrase library. Phrases are matched case-insensitively with word boundaries. The category with the highest score wins. If the top score is below the minimum threshold, the document falls into '14. Miscellaneous / Unknown'. This pass is deterministic — same input → same output."),
        ("Step 4: TF-IDF vectorisation",
         f"Each readable document with >= {MIN_TEXT_CHARS} chars of text is converted into a TF-IDF vector (uni- and bi-grams, English stop words removed, sublinear TF, float32). Vocabulary grows with corpus size up to 20,000 features. Scanned PDFs are excluded — no text to vectorise."),
        ("Step 5: Clustering (Pass 2)",
         f"Group the document vectors into K clusters using {algo}. K = clip(round(sqrt(N/2)), 2, 12), where N is the number of readable docs. For this run, N={n_readable} so K={k_used}. Plain KMeans is used up to N={MINIBATCH_THRESHOLD}; above that, MiniBatchKMeans is used — orders of magnitude faster on large corpora with minimal quality loss."),
        ("Step 6: Cluster labelling",
         "For each cluster, the top 6 terms of its centroid become the cluster's human-readable label."),
        ("Step 7: Reporting",
         "Per-PDF: category + score + matched terms + cluster ID + cluster top terms. Per-category: counts and % share. Per-cluster: size, top terms, dominant category, and the breakdown of categories inside the cluster — that breakdown is where you'll spot mis-categorizations and document sub-types."),
        ("Note: Categories vs. clusters",
         "Categories are FIXED (14 named buckets). Clusters are DATA-DRIVEN (number depends on N). They are not the same thing and the count will almost always differ from 14. Use clusters to validate or refine categories, not to replace them."),
    ]
    return pd.DataFrame(rows, columns=["Step", "Description"])


def _process_pool(pdfs: list[Path], workers: int) -> list[dict]:
    """Run `process_pdf` over every path with a ProcessPoolExecutor.

    Yields completed results as they finish so we can render a progress bar.
    Errors inside a worker are turned into a record with `classification='Error'`
    rather than killing the run.
    """
    paths = [str(p) for p in pdfs]
    results: list[dict] = []

    iterator = tqdm(total=len(paths), desc="Processing PDFs", unit="pdf") if _HAS_TQDM else None

    with ProcessPoolExecutor(max_workers=workers) as pool:
        # submit() in chunks to keep the queue small for huge corpora.
        future_to_path = {pool.submit(process_pdf, p): p for p in paths}
        for fut in as_completed(future_to_path):
            p = future_to_path[fut]
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({
                    "path": p, "pages": 0, "classification": "Error",
                    "text": "", "size_mb": 0.0, "error": f"worker crashed: {e}",
                    "cat_category": "N/A (not readable)", "cat_score": 0,
                    "cat_matched_terms": "", "cat_runner_up": "", "cat_runner_up_score": 0,
                })
            if iterator is not None:
                iterator.update(1)
            elif len(results) % 100 == 0 or len(results) == len(paths):
                print(f"  {len(results)}/{len(paths)}")
    if iterator is not None:
        iterator.close()

    # Restore original input ordering for deterministic output sort downstream.
    order = {p: i for i, p in enumerate(paths)}
    results.sort(key=lambda r: order.get(r["path"], 0))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                        help=f"parallel worker processes (default: {DEFAULT_WORKERS})")
    parser.add_argument("--root", type=Path, default=ROOT,
                        help="root directory to scan (default: script's folder)")
    args = parser.parse_args()

    root = args.root.resolve()
    workers = max(1, args.workers)

    pdfs = find_pdfs(root)
    if not pdfs:
        print(f"No PDFs found under {root} (after skipping Transactional and hidden folders).")
        return

    import time
    t0 = time.time()
    print(f"Found {len(pdfs)} PDF(s). Processing with {workers} worker(s)...")
    if workers == 1:
        records = []
        iterator = tqdm(pdfs, desc="Processing PDFs", unit="pdf") if _HAS_TQDM else pdfs
        for p in iterator:
            records.append(process_pdf(str(p)))
    else:
        records = _process_pool(pdfs, workers)
    extraction_secs = time.time() - t0
    print(f"  text extraction + categorization: {extraction_secs:.1f}s "
          f"({len(pdfs)/max(extraction_secs,0.001):.1f} PDFs/s)")

    # Cluster only docs with enough text.
    cluster_candidates = [
        r for r in records
        if r["classification"] in ("Readable", "Mixed") and len(r["text"].strip()) >= MIN_TEXT_CHARS
    ]
    t1 = time.time()
    labels, top_terms, k_used, algo = cluster_documents([r["text"] for r in cluster_candidates])
    clustering_secs = time.time() - t1
    print(f"  clustering ({algo}, K={k_used}, N={len(cluster_candidates)}): {clustering_secs:.1f}s")

    for r, lab in zip(cluster_candidates, labels):
        r["cluster_id"] = lab
        r["cluster_top_terms"] = top_terms[lab] if lab < len(top_terms) else ""

    # Build the per-PDF dataframe.
    detail_rows = []
    for r in records:
        path = Path(r["path"])
        try:
            rel = path.relative_to(root)
            base_folder = rel.parts[0]
            folder = str(rel.parent)
        except ValueError:
            base_folder = ""
            folder = str(path.parent)
        detail_rows.append({
            "Base Folder": base_folder,
            "Folder": folder,
            "File": path.name,
            "Pages": r["pages"],
            "Size (MB)": r["size_mb"],
            "Classification": r["classification"],
            "Category": r["cat_category"],
            "Category Score": r["cat_score"],
            "Top Matched Terms": r["cat_matched_terms"],
            "Runner-up Category": r["cat_runner_up"],
            "Runner-up Score": r["cat_runner_up_score"],
            "Cluster ID": r.get("cluster_id", ""),
            "Cluster Top Terms": r.get("cluster_top_terms", ""),
            "Error": r["error"],
        })
    df_detail = pd.DataFrame(detail_rows).sort_values(["Base Folder", "Folder", "File"]).reset_index(drop=True)

    # Category counts (overall).
    df_cat_counts = (
        df_detail.groupby("Category").size().reset_index(name="Count")
        .sort_values("Count", ascending=False)
    )
    if not df_cat_counts.empty:
        df_cat_counts["% of Total"] = (df_cat_counts["Count"] / df_cat_counts["Count"].sum() * 100).round(2)

    # Category by base folder.
    df_cat_by_folder = (
        df_detail.groupby(["Base Folder", "Category"]).size().unstack(fill_value=0).reset_index()
        if not df_detail.empty else pd.DataFrame()
    )

    # Cluster summary.
    cluster_summary_rows = []
    df_with_clusters = df_detail[df_detail["Cluster ID"] != ""].copy()
    if not df_with_clusters.empty:
        df_with_clusters["Cluster ID"] = df_with_clusters["Cluster ID"].astype(int)
        for cid in sorted(df_with_clusters["Cluster ID"].unique()):
            sub = df_with_clusters[df_with_clusters["Cluster ID"] == cid]
            dominant = sub["Category"].mode().iat[0] if not sub.empty else ""
            cluster_summary_rows.append({
                "Cluster ID": cid,
                "Size": len(sub),
                "Top Terms": top_terms[cid] if cid < len(top_terms) else "",
                "Dominant Category": dominant,
                "Category Mix": ", ".join(f"{c}: {n}" for c, n in sub["Category"].value_counts().items()),
            })
    df_clusters = pd.DataFrame(cluster_summary_rows)

    # Methodology + rules.
    df_method = methodology_text(len(cluster_candidates), k_used, algo, workers)
    df_rules = pd.DataFrame(
        # Rules can be (phrase, weight) or (phrase, weight, display). Normalise.
        [(cat, (t[2] if len(t) == 3 else t[0]), t[1])
         for cat, terms in CATEGORY_RULES.items() for t in terms],
        columns=["Category", "Phrase / Pattern", "Weight"],
    )

    # Summary.
    summary_rows = [
        {"Metric": "Root scanned", "Value": str(root)},
        {"Metric": "Worker processes", "Value": workers},
        {"Metric": "Total PDFs found", "Value": len(records)},
        {"Metric": "Readable PDFs", "Value": int((df_detail["Classification"] == "Readable").sum())},
        {"Metric": "Mixed PDFs", "Value": int((df_detail["Classification"] == "Mixed").sum())},
        {"Metric": "Scanned PDFs (excluded from clustering)", "Value": int((df_detail["Classification"] == "Scanned").sum())},
        {"Metric": "Errored PDFs", "Value": int((df_detail["Classification"] == "Error").sum())},
        {"Metric": "PDFs categorized", "Value": int((df_detail["Category"] != "N/A (not readable)").sum())},
        {"Metric": "PDFs in Miscellaneous/Unknown", "Value": int((df_detail["Category"] == UNKNOWN_CATEGORY).sum())},
        {"Metric": "Distinct categories observed", "Value": int(df_detail.loc[df_detail["Category"] != "N/A (not readable)", "Category"].nunique())},
        {"Metric": "Documents clustered (N)", "Value": len(cluster_candidates)},
        {"Metric": "Clustering algorithm", "Value": algo},
        {"Metric": "K (clusters)", "Value": k_used},
        {"Metric": "Extraction + categorization (sec)", "Value": round(extraction_secs, 1)},
        {"Metric": "Clustering (sec)", "Value": round(clustering_secs, 1)},
    ]
    df_summary = pd.DataFrame(summary_rows)

    output_file = root / f"{root.name}_PDF_Clusters.xlsx"
    with pd.ExcelWriter(output_file, engine="openpyxl") as w:
        df_method.to_excel(w, sheet_name="Methodology", index=False)
        df_summary.to_excel(w, sheet_name="Summary", index=False)
        df_detail.to_excel(w, sheet_name="PDF Categorization", index=False)
        if not df_cat_counts.empty:
            df_cat_counts.to_excel(w, sheet_name="Category Counts", index=False)
        if not df_cat_by_folder.empty:
            df_cat_by_folder.to_excel(w, sheet_name="Category By Folder", index=False)
        if not df_clusters.empty:
            df_clusters.to_excel(w, sheet_name="Cluster Summary", index=False)
        df_rules.to_excel(w, sheet_name="Category Rules", index=False)

    total_secs = time.time() - t0
    print(f"\nWrote {output_file}")
    print(f"  PDFs: {len(records)}  |  Readable: {sum(1 for r in records if r['classification']=='Readable')}"
          f"  |  Clustered: {len(cluster_candidates)}  |  K: {k_used} ({algo})")
    print(f"  Total wall time: {total_secs:.1f}s  ({len(pdfs)/max(total_secs,0.001):.1f} PDFs/s end-to-end)")


if __name__ == "__main__":
    main()
