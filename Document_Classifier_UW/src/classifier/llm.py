"""One function that calls Claude on Amazon Bedrock and returns a typed result.

``call_claude`` takes the Pydantic schema you want back, the prompt, and the
allowed document-type values. It constrains the model to valid taxonomy values
(structured outputs) and returns a validated object. No ``kind``, no payload.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from . import taxonomy
from .settings import get_settings

# Which schema fields are controlled vocabularies (filled from the taxonomy).
_DOC, _LOB, _UC = "doc", "lob", "uc"
_PROP_VOCAB = {
    "doc_type": _DOC, "doc_type_signal": _DOC, "final_doc_type": _DOC,
    "lob_signals": _LOB, "primary_lob": _LOB, "additional_lobs": _LOB,
    "use_case": _UC, "use_case_signals": _UC, "alternatives": _UC,
}

_client = None


def _bedrock():
    global _client
    if _client is None:
        import anthropic  # imported lazily (only needed at call time)

        _client = anthropic.AnthropicBedrock(aws_region=get_settings().region)
    return _client


def _strict(node: Any):
    """Make every object additionalProperties:false + all-required (structured-output rule)."""
    if isinstance(node, dict):
        node.pop("title", None)
        node.pop("default", None)
        if node.get("type") == "object":
            props = node.get("properties", {})
            node["required"] = list(props.keys())
            node["additionalProperties"] = False
            for v in props.values():
                _strict(v)
        if "items" in node:
            _strict(node["items"])
    return node


def _inject_enums(node: Any, vocab: dict[str, list[str]]):
    """Set the allowed values on controlled-vocabulary fields."""
    if isinstance(node, dict):
        for name, sub in (node.get("properties") or {}).items():
            tag = _PROP_VOCAB.get(name)
            if tag and isinstance(sub, dict):
                if sub.get("type") == "array":
                    sub.setdefault("items", {})
                    sub["items"].update({"type": "string", "enum": vocab[tag]})
                else:
                    sub.update({"type": "string", "enum": vocab[tag]})
        if "items" in node:
            _inject_enums(node["items"], vocab)
    return node


def json_schema_for(schema: type[BaseModel], doc_types: list[str] | None = None) -> dict:
    t = taxonomy.get()
    vocab = {_DOC: doc_types or t.doc_types_for(t.default_modality),
             _LOB: t.lobs, _UC: t.use_cases}
    return _inject_enums(_strict(schema.model_json_schema()), vocab)


def call_claude(schema: type[BaseModel], system: str, user: str, *,
                model: str, doc_types: list[str] | None = None,
                max_tokens: int = 2048, thinking: bool = False) -> BaseModel:
    kwargs = dict(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"format": {"type": "json_schema",
                                  "schema": json_schema_for(schema, doc_types)}},
    )
    if thinking:
        kwargs["thinking"] = {"type": "adaptive"}
    resp = _bedrock().messages.create(**kwargs)
    text = next(b.text for b in resp.content if b.type == "text")
    return schema.model_validate_json(text)
