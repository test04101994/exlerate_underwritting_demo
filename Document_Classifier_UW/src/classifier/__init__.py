"""LangGraph-orchestrated, configurable document classification engine.

Domain specifics live in config/taxonomy.yaml and prompts.py; the engine itself
is generic.
"""

from .pipeline import classify, run_documents, run_package

__version__ = "0.4.0"
__all__ = ["classify", "run_documents", "run_package", "__version__"]
