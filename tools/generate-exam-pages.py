#!/usr/bin/env python3
"""Generate static, SEO-friendly landing pages for each exam pack.

Reads published exam metadata under user-content/exams/ and renders one HTML
page per exam into exams/<id>/index.html, a hub at exams/index.html, and a
refreshed sitemap.xml. Pure standard library, no third-party dependencies.

Run from the repository root:  python tools/generate-exam-pages.py
"""

from __future__ import annotations

import html
import json
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parents[1]
EXAMS_SRC = ROOT / "user-content" / "exams"
INDEX_JSON = EXAMS_SRC / "index.json"
TEMPLATE_PATH = ROOT / "tools" / "exam-page-template.html"

SITE = "https://examplar.app"
OG_IMAGE = f"{SITE}/assets/media/og-image.png"
THEME_COLOR = "#1e3c72"


def esc(value) -> str:
    """HTML-escape a value for safe insertion into markup attributes/text."""
    return html.escape(str(value), quote=True)


def exam_code(meta: dict) -> str:
    """Human-facing exam code, e.g. 'SC-900'."""
    return str(meta.get("certificationCode") or meta.get("name") or meta.get("id", "")).strip()


def load_exam_ids(index_path: Path = INDEX_JSON) -> list:
    return json.loads(index_path.read_text(encoding="utf-8"))


def load_metadata(exam_id: str, src: Path = EXAMS_SRC):
    meta_path = src / exam_id / "metadata.json"
    if not meta_path.is_file():
        return None
    return json.loads(meta_path.read_text(encoding="utf-8"))


def load_exams(index_path: Path = INDEX_JSON, src: Path = EXAMS_SRC) -> list:
    """Load metadata for every id in index.json; skip ids without metadata."""
    exams = []
    for exam_id in load_exam_ids(index_path):
        meta = load_metadata(exam_id, src)
        if meta is None:
            print(f"warning: skipping {exam_id} (no metadata.json)")
            continue
        meta.setdefault("id", exam_id)
        exams.append(meta)
    return exams
