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


def build_facts(meta: dict) -> str:
    pairs = [
        ("Vendor", meta.get("vendor")),
        ("Certification", exam_code(meta)),
        ("Level", meta.get("level") or meta.get("badge")),
        ("Questions per attempt", meta.get("questionCount")),
        ("Question bank", meta.get("totalQuestions")),
        ("Time limit", f"{meta.get('duration')} min" if meta.get("duration") is not None else None),
        ("Pass score", f"{meta.get('passScore')}%" if meta.get("passScore") is not None else None),
    ]
    rows = [
        f'      <tr><th scope="row">{esc(label)}</th><td>{esc(value)}</td></tr>'
        for label, value in pairs
        if value not in (None, "")
    ]
    if not rows:
        return ""
    body = "\n".join(rows)
    return (
        '    <table class="exam-facts">\n'
        "      <caption>Exam at a glance</caption>\n"
        f"{body}\n"
        "    </table>"
    )


def build_domains(meta: dict) -> str:
    domains = meta.get("objectiveDomains") or []
    items = []
    for domain in domains:
        name = esc(domain.get("name", ""))
        code = esc(domain.get("code", ""))
        weight = domain.get("weightRange")
        label = f"{code}: {name}" if code else name
        weight_html = f' <span class="domain-weight">{esc(weight)}</span>' if weight else ""
        items.append(f"      <li>{label}{weight_html}</li>")
    if not items:
        return ""
    body = "\n".join(items)
    return (
        '    <section class="exam-section" aria-labelledby="domains-h">\n'
        '      <h2 id="domains-h">Objective domains</h2>\n'
        '      <ul class="exam-domains">\n'
        f"{body}\n"
        "      </ul>\n"
        "    </section>"
    )


def build_modules(meta: dict) -> str:
    modules = meta.get("modules") or []
    items = "\n".join(
        f"      <li>{esc(module.get('name', ''))}</li>"
        for module in modules
        if module.get("name")
    )
    if not items:
        return ""
    return (
        '    <section class="exam-section" aria-labelledby="modules-h">\n'
        '      <h2 id="modules-h">Topics covered</h2>\n'
        '      <ul class="exam-modules">\n'
        f"{items}\n"
        "      </ul>\n"
        "    </section>"
    )


def build_resources(meta: dict) -> str:
    links = []
    for resource in meta.get("resources") or []:
        url = resource.get("url")
        name = resource.get("name")
        if not url or not name:
            continue
        links.append(
            f'      <li><a href="{esc(url)}" rel="nofollow noopener" '
            f'target="_blank">{esc(name)}</a></li>'
        )
    if not links:
        return ""
    body = "\n".join(links)
    return (
        '    <section class="exam-section" aria-labelledby="resources-h">\n'
        '      <h2 id="resources-h">Official resources</h2>\n'
        '      <ul class="exam-resources">\n'
        f"{body}\n"
        "      </ul>\n"
        "    </section>"
    )


def faq_pairs(meta: dict) -> list:
    """Return (question, answer) pairs as plain text. Callers must HTML-escape before markup."""
    code = exam_code(meta)
    full = meta.get("fullName") or code
    count = meta.get("totalQuestions") or meta.get("questionCount")
    bank = f"{count} practice questions" if count else "a bank of practice questions"
    return [
        (
            f"Is the {code} practice exam free?",
            f"Yes. The {code} practice exam on Examplar is completely free, with no "
            "account and no sign-up.",
        ),
        (
            f"Are these real {code} exam questions?",
            f"No. These are original, syllabus-aligned questions written to match the "
            f"official objectives for {full}. They are not copied from the live exam.",
        ),
        (
            "Does my data stay private?",
            "Yes. Examplar runs fully in your browser and works offline. Your answers "
            "and progress never leave your device.",
        ),
        (
            f"How many {code} questions are included?",
            f"The {code} pack ships {bank} covering every objective domain.",
        ),
    ]


def build_faq(meta: dict) -> str:
    items = []
    for question, answer in faq_pairs(meta):
        items.append(
            '      <details class="faq-item">\n'
            f"        <summary>{esc(question)}</summary>\n"
            f"        <p>{esc(answer)}</p>\n"
            "      </details>"
        )
    body = "\n".join(items)
    return (
        '    <section class="exam-section faq" aria-labelledby="faq-h">\n'
        '      <h2 id="faq-h">Frequently asked questions</h2>\n'
        f"{body}\n"
        "    </section>"
    )


def build_crosslinks(meta: dict, all_exams: list) -> str:
    others = [e for e in all_exams if e.get("id") != meta.get("id")]
    if not others:
        return ""
    links = "\n".join(
        f'      <li><a href="{SITE}/exams/{esc(e.get("id", ""))}/">'
        f"{esc(exam_code(e))} practice exam</a></li>"
        for e in others
    )
    return (
        '    <section class="exam-section" aria-labelledby="more-h">\n'
        '      <h2 id="more-h">More practice exams</h2>\n'
        '      <ul class="exam-crosslinks">\n'
        f"{links}\n"
        "      </ul>\n"
        "    </section>"
    )


def page_title(meta: dict) -> str:
    return f"{exam_code(meta)} Practice Exam (Free, No Sign-up) | Examplar"


def page_description(meta: dict) -> str:
    code = exam_code(meta)
    full = meta.get("fullName") or code
    count = meta.get("totalQuestions") or meta.get("questionCount")
    count_txt = f"{count} free practice questions" if count else "free practice questions"
    return (
        f"Free {code} practice exam for {full}. {count_txt}, original and "
        "syllabus-aligned. No account, works offline, your data stays in your browser."
    )


def build_jsonld(meta: dict) -> str:
    code = exam_code(meta)
    url = f"{SITE}/exams/{meta['id']}/"
    duration = meta.get("duration") or 45
    graph = [
        {
            "@type": "Course",
            "@id": f"{url}#course",
            "name": f"{code} Practice Exam",
            "description": page_description(meta),
            "url": url,
            "inLanguage": meta.get("language", "en"),
            "isAccessibleForFree": True,
            "provider": {"@type": "Organization", "name": "Examplar", "url": f"{SITE}/"},
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD", "category": "Free"},
            "hasCourseInstance": {
                "@type": "CourseInstance",
                "courseMode": "online",
                "courseWorkload": f"PT{duration}M",
            },
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
                {"@type": "ListItem", "position": 2, "name": "Exams", "item": f"{SITE}/exams/"},
                {"@type": "ListItem", "position": 3, "name": code, "item": url},
            ],
        },
        {
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": question,
                    "acceptedAnswer": {"@type": "Answer", "text": answer},
                }
                for question, answer in faq_pairs(meta)
            ],
        },
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2)


def render_exam_page(meta: dict, all_exams: list, template: str) -> str:
    code = exam_code(meta)
    url = f"{SITE}/exams/{meta['id']}/"
    full = meta.get("fullName") or code
    intro = (
        f"Practice for {full} the private way. Original, syllabus-aligned questions "
        "you can run entirely in your browser, offline, with no account and no tracking."
    )
    mapping = {
        "lang": esc(meta.get("language", "en")),
        "title": esc(page_title(meta)),
        "description": esc(page_description(meta)),
        "canonical": url,
        "og_title": esc(page_title(meta)),
        "og_description": esc(page_description(meta)),
        "og_url": url,
        "og_image": OG_IMAGE,
        "theme_color": THEME_COLOR,
        "exam_code": esc(code),
        "full_name": esc(full),
        "intro": esc(intro),
        "cta_url": f"{SITE}/exam.html?exam={esc(meta['id'])}",
        "facts": build_facts(meta),
        "domains": build_domains(meta),
        "modules": build_modules(meta),
        "resources": build_resources(meta),
        "faq": build_faq(meta),
        "crosslinks": build_crosslinks(meta, all_exams),
        "jsonld": build_jsonld(meta),
    }
    return Template(template).substitute(mapping)
