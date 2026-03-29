"""Tools for the Submissions workflow — calculator + doc analysis + data extraction."""

from .calculator import add, divide, multiply, subtract
from .data_extraction_tool import extract_data
from .doc_analysis import doc_analysis

SUBMISSIONS_TOOLS = [add, subtract, multiply, divide, extract_data, doc_analysis]

__all__ = ["SUBMISSIONS_TOOLS", "add", "subtract", "multiply", "divide", "extract_data", "doc_analysis"]
