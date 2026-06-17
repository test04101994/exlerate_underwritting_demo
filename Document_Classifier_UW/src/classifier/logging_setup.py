"""Logging configuration. All modules log via logging.getLogger(__name__).

In AWS Lambda the runtime already installs a root handler, so we only set the
level there. Locally (no handlers) we add a stderr handler.
"""

from __future__ import annotations

import logging
import sys


def configure(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-7s %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S"))
        root.addHandler(handler)
    root.setLevel(getattr(logging, str(level).upper(), logging.INFO))
