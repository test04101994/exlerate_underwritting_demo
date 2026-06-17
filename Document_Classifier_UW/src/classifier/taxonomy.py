"""Loads the classification vocabulary from config/taxonomy.yaml.

Provides document types (a "standard" set for PDF/email plus a separate "excel"
set), lines of business, use cases, and the modality config (which file
extensions map to which set, and which classification heads each modality runs).

Read at runtime, so adding a category in YAML needs no code change.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

from .settings import REPO_ROOT, get_settings

VALID_HEADS = ("document_type", "lob", "use_case")


def _taxonomy_path() -> Path:
    env = os.getenv("CLASSIFIER_TAXONOMY")
    if env:
        return Path(env).expanduser()
    configured = get_settings().taxonomy_path
    return Path(configured) if configured else REPO_ROOT / "config" / "taxonomy.yaml"


@dataclass
class DocTypeSet:
    names: list[str]
    descriptions: dict[str, str]
    keywords: dict[str, list[str]]


@dataclass
class Modality:
    name: str
    extensions: list[str]
    document_type_set: str
    classify: list[str]


@dataclass
class Taxonomy:
    doc_type_sets: dict[str, DocTypeSet]
    lobs: list[str]
    use_cases: list[str]
    lob_descriptions: dict[str, str]
    use_case_descriptions: dict[str, str]
    lob_keywords: dict[str, list[str]]
    use_case_keywords: dict[str, list[str]]
    use_case_expected_documents: dict[str, list[str]]
    modalities: dict[str, Modality]
    default_modality: str
    ext_map: dict[str, str]
    source_path: str

    def modality_for_extension(self, ext: str) -> str:
        return self.ext_map.get(ext.lower(), self.default_modality)

    def _set(self, modality: str) -> DocTypeSet:
        m = self.modalities.get(modality)
        return self.doc_type_sets[m.document_type_set if m else "standard"]

    def doc_types_for(self, modality: str) -> list[str]:
        return self._set(modality).names

    def doc_descriptions_for(self, modality: str) -> dict[str, str]:
        return self._set(modality).descriptions

    def doc_keywords_for(self, modality: str) -> dict[str, list[str]]:
        return self._set(modality).keywords

    def classify_for(self, modality: str) -> list[str]:
        m = self.modalities.get(modality)
        return list(m.classify) if m else list(VALID_HEADS)

    def enabled_heads(self, modalities: list[str]) -> list[str]:
        heads: set[str] = set()
        for mod in modalities:
            heads.update(self.classify_for(mod))
        return [h for h in VALID_HEADS if h in heads]


def _parse(items, section, extra_keys=()):
    names, descriptions, keywords = [], {}, {}
    extra = {k: {} for k in extra_keys}
    seen = set()
    for i, item in enumerate(items or []):
        if not isinstance(item, dict) or "name" not in item:
            raise ValueError(f"{section}[{i}] is missing a 'name'.")
        name = str(item["name"]).strip()
        if not name or name in seen:
            raise ValueError(f"{section}: empty or duplicate name {name!r}.")
        seen.add(name)
        desc = str(item.get("description", "")).strip()
        if not desc:
            raise ValueError(f"{section} entry {name!r} is missing a 'description'.")
        names.append(name)
        descriptions[name] = desc
        keywords[name] = [str(k).lower() for k in (item.get("keywords") or [])]
        for ek in extra_keys:
            extra[ek][name] = [str(v) for v in (item.get(ek) or [])]
    if not names:
        raise ValueError(f"Taxonomy section '{section}' is empty.")
    return names, descriptions, keywords, extra


def load(path=None) -> Taxonomy:
    p = Path(path) if path else _taxonomy_path()
    if not p.exists():
        raise FileNotFoundError(f"Taxonomy file not found: {p}")
    raw = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    for key in ("document_types", "lines_of_business", "use_cases", "modalities"):
        if key not in raw:
            raise ValueError(f"Taxonomy {p} is missing top-level key '{key}'.")

    names, desc, kw, _ = _parse(raw["document_types"], "document_types")
    doc_type_sets = {"standard": DocTypeSet(names, desc, kw)}
    if raw.get("excel_document_types"):
        n, d, k, _ = _parse(raw["excel_document_types"], "excel_document_types")
        doc_type_sets["excel"] = DocTypeSet(n, d, k)

    lob_names, lob_desc, lob_kw, lob_x = _parse(
        raw["lines_of_business"], "lines_of_business", ("typical_documents",))
    uc_names, uc_desc, uc_kw, uc_x = _parse(
        raw["use_cases"], "use_cases", ("expected_documents",))

    modalities, ext_map = {}, {}
    for name, cfg in raw["modalities"].items():
        cfg = cfg or {}
        exts = [str(e).lower() for e in (cfg.get("extensions") or [])]
        set_name = str(cfg.get("document_type_set", "standard"))
        if set_name not in doc_type_sets:
            raise ValueError(f"modality '{name}' references unknown set '{set_name}'.")
        classify = [str(c) for c in (cfg.get("classify") or list(VALID_HEADS))]
        for c in classify:
            if c not in VALID_HEADS:
                raise ValueError(f"modality '{name}' has invalid head '{c}'.")
        modalities[name] = Modality(name, exts, set_name, classify)
        for e in exts:
            ext_map[e] = name

    default_modality = str(raw.get("default_modality", "pdf"))
    if default_modality not in modalities:
        raise ValueError(f"default_modality '{default_modality}' is not defined.")

    return Taxonomy(
        doc_type_sets=doc_type_sets, lobs=lob_names, use_cases=uc_names,
        lob_descriptions=lob_desc, use_case_descriptions=uc_desc,
        lob_keywords=lob_kw, use_case_keywords=uc_kw,
        use_case_expected_documents=uc_x["expected_documents"],
        modalities=modalities, default_modality=default_modality,
        ext_map=ext_map, source_path=str(p),
    )


_cache: Taxonomy | None = None


def get() -> Taxonomy:
    global _cache
    if _cache is None:
        _cache = load()
    return _cache


def reload(path=None) -> Taxonomy:
    global _cache
    _cache = load(path)
    return _cache
