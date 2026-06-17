"""Generate the binary Excel sample packages (not committed as binaries).

    python data/make_samples.py

Creates:
  data/sample_excel_only/premium_bordereau.xlsx   (excel-only -> doc + LOB only)
"""

from __future__ import annotations

import logging
import os

import openpyxl

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("make_samples")

HERE = os.path.dirname(__file__)


def make_premium_bordereau(path: str) -> None:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Premium Bordereau"
    ws.append(["Premium Bordereau - Q2 2026 - Delegated Authority"])
    ws.append(["Policy Number", "Insured", "Line of Business", "Written Premium"])
    ws.append(["WC-1001", "ACME Manufacturing LLC", "Workers Compensation", 48000])
    ws.append(["WC-1002", "Brightline Logistics", "Workers Compensation", 31500])
    ws.append(["WC-1003", "Harbor Foods Inc", "Workers Compensation", 22750])
    wb.save(path)
    logger.info("wrote %s", path)


def main() -> None:
    out_dir = os.path.join(HERE, "sample_excel_only")
    os.makedirs(out_dir, exist_ok=True)
    make_premium_bordereau(os.path.join(out_dir, "premium_bordereau.xlsx"))


if __name__ == "__main__":
    main()
