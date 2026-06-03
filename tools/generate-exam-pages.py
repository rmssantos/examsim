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


def is_free(meta: dict) -> bool:
    """True for fully free packs; False for pro/preview packs with a paid upgrade."""
    return meta.get("commercialStatus", "free") == "free"


def build_facts(meta: dict) -> str:
    bank_label = "Question bank" if is_free(meta) else "Free preview questions"
    pairs = [
        ("Vendor", meta.get("vendor")),
        ("Certification", exam_code(meta)),
        ("Level", meta.get("level") or meta.get("badge")),
        ("Questions per attempt", meta.get("questionCount")),
        (bank_label, meta.get("totalQuestions")),
        ("Time limit", f"{meta.get('duration')} min" if meta.get("duration") is not None else None),
        ("Pass score", f"{meta.get('passScore')}%" if meta.get("passScore") is not None else None),
    ]
    pro = meta.get("pro") or {}
    if pro.get("questions"):
        pairs.append(("Full pack", f"{pro['questions']} questions"))
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
    pro = meta.get("pro") or {}

    if is_free(meta):
        free_answer = (
            f"Yes. The {code} practice exam on Examplar is completely free, with no "
            "account and no sign-up."
        )
        bank = f"{count} practice questions" if count else "a bank of practice questions"
        count_answer = f"The {code} pack ships {bank} covering every objective domain."
    else:
        full_pack = pro.get("questions")
        price = pro.get("price")
        free_answer = (
            f"The {count}-question {code} preview is free, with no account. "
            f"The complete {full_pack}-question pack is a one-time {price}."
            if count and full_pack and price
            else f"The {code} preview is free. The complete pack is a one-time purchase."
        )
        count_answer = (
            f"The free preview includes {count} questions. The full "
            f"{pro.get('title', code + ' Complete')} pack includes {full_pack} questions "
            "with detailed explanations and study mode."
            if count and full_pack
            else "The free preview is a sample; the full pack covers every objective."
        )

    return [
        (f"Is the {code} practice exam free?", free_answer),
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
        (f"How many {code} questions are included?", count_answer),
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


def build_crosslinks(meta: dict, all_exams: list, root: str = "../../") -> str:
    others = [e for e in all_exams if e.get("id") != meta.get("id")]
    if not others:
        return ""
    links = "\n".join(
        f'      <li><a href="{root}exams/{esc(e.get("id", ""))}/index.html">'
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
    code = exam_code(meta)
    if is_free(meta):
        return f"{code} Practice Exam (Free, No Sign-up) | Examplar"
    count = meta.get("questionCount") or meta.get("totalQuestions")
    if count:
        return f"{code} Practice Exam (Free {count}-Question Preview) | Examplar"
    return f"{code} Practice Exam (Free Preview) | Examplar"


def page_description(meta: dict) -> str:
    authored = meta.get("description")
    if authored:
        return authored
    code = exam_code(meta)
    full = meta.get("fullName") or code
    count = meta.get("totalQuestions") or meta.get("questionCount")
    count_txt = f"{count} free practice questions" if count else "free practice questions"
    return (
        f"Free {code} practice exam for {full}. {count_txt}, original and "
        "syllabus-aligned. No account, works offline, your data stays in your browser."
    )


def page_kicker(meta: dict) -> str:
    return "Free practice exam" if is_free(meta) else "Free preview"


def cta_label(meta: dict) -> str:
    return "Start practicing free" if is_free(meta) else "Start the free preview"


def _parse_price(price: str) -> tuple:
    """Split a price like '19 EUR' into ('19', 'EUR'); default currency EUR."""
    parts = str(price or "").split()
    amount = parts[0] if parts else "0"
    currency = parts[1] if len(parts) > 1 else "EUR"
    return amount, currency


def build_pro(meta: dict) -> str:
    """Upsell section for pro/preview packs; empty string for fully free packs."""
    pro = meta.get("pro")
    if not pro:
        return ""
    code = exam_code(meta)
    title = esc(pro.get("title", f"{code} Complete"))
    price = esc(pro.get("price", ""))
    url = esc(pro.get("url", "#"))
    questions = pro.get("questions")
    qs_txt = f"all {esc(questions)} questions" if questions else "the complete question bank"
    highlights = [h for h in (pro.get("highlights") or []) if h]
    if highlights:
        items = "\n".join(f"      <li>{esc(h)}</li>" for h in highlights)
        highlights_html = f'    <ul class="pro-highlights">\n{items}\n    </ul>\n'
    else:
        highlights_html = ""
    price_html = f' One-time <span class="pro-price">{price}</span>.' if price else ""
    return (
        '    <section class="exam-pro" aria-labelledby="pro-h">\n'
        f"      <h2 id=\"pro-h\">Get {title}</h2>\n"
        f"      <p>Unlock {qs_txt} with detailed explanations for every answer and "
        f"study mode.{price_html}</p>\n"
        f"{highlights_html}"
        f'      <a class="pro-cta" href="{url}" rel="nofollow noopener" target="_blank">'
        "Unlock the full pack</a>\n"
        "    </section>"
    )


def build_jsonld(meta: dict) -> str:
    code = exam_code(meta)
    url = f"{SITE}/exams/{meta['id']}/"
    duration = meta.get("duration") or 45
    # The preview is always free to start; pro/preview packs add a paid full pack.
    offers = [{"@type": "Offer", "price": "0", "priceCurrency": "USD", "category": "Free"}]
    pro = meta.get("pro") or {}
    if pro.get("price"):
        amount, currency = _parse_price(pro["price"])
        offers.append({
            "@type": "Offer",
            "price": amount,
            "priceCurrency": currency,
            "category": "Full pack",
            "url": pro.get("url", url),
        })
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
            "offers": offers if len(offers) > 1 else offers[0],
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
    raw = json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2)
    # Escape "</" so a metadata value containing "</script>" cannot break out of the
    # surrounding <script type="application/ld+json"> block. "<\/" is valid JSON and
    # parses back to "</".
    return raw.replace("</", "<\\/")


def render_exam_page(meta: dict, all_exams: list, template: str) -> str:
    code = exam_code(meta)
    url = f"{SITE}/exams/{meta['id']}/"
    # Exam pages live at /exams/<id>/, so site-root assets and pages are two
    # levels up. Relative paths keep the pages working when opened directly
    # (file://), served via server.py, or deployed at the domain root.
    root = "../../"
    full = meta.get("fullName") or code
    if is_free(meta):
        intro = (
            f"Practice for {full} the private way. Original, syllabus-aligned questions "
            "you can run entirely in your browser, offline, with no account and no tracking."
        )
    else:
        count = meta.get("totalQuestions") or meta.get("questionCount")
        full_pack = (meta.get("pro") or {}).get("questions")
        preview_txt = f"Free {count}-question preview of {full}. " if count else f"Free preview of {full}. "
        unlock_txt = (
            f"Unlock the complete {full_pack}-question pack for detailed explanations and study mode."
            if full_pack
            else "Unlock the complete pack for detailed explanations and study mode."
        )
        intro = (
            f"{preview_txt}Original, syllabus-aligned questions you can run in your browser, "
            f"offline, with no account. {unlock_txt}"
        )
    title = esc(page_title(meta))
    description = esc(page_description(meta))
    mapping = {
        "lang": esc(meta.get("language", "en")),
        "title": title,
        "description": description,
        "canonical": url,
        "og_title": title,
        "og_description": description,
        "og_url": url,
        "og_image": OG_IMAGE,
        "theme_color": THEME_COLOR,
        "exam_code": esc(code),
        "full_name": esc(full),
        "intro": esc(intro),
        "kicker": esc(page_kicker(meta)),
        "cta_label": esc(cta_label(meta)),
        "root": root,
        "cta_url": f"{root}exam.html?exam={esc(meta['id'])}",
        "facts": build_facts(meta),
        "domains": build_domains(meta),
        "modules": build_modules(meta),
        "resources": build_resources(meta),
        "pro": build_pro(meta),
        "faq": build_faq(meta),
        "crosslinks": build_crosslinks(meta, all_exams, root),
        "jsonld": build_jsonld(meta),
    }
    return Template(template).substitute(mapping)


def render_sitemap(all_exams: list) -> str:
    entries = [(f"{SITE}/", "1.0"), (f"{SITE}/exams/", "0.9")]
    entries += [(f"{SITE}/exams/{e['id']}/", "0.8") for e in all_exams]
    entries.append((f"{SITE}/privacy-and-storage.html", "0.3"))
    body = "\n".join(
        f"  <url><loc>{loc}</loc><priority>{priority}</priority></url>"
        for loc, priority in entries
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )


def render_hub(all_exams: list) -> str:
    # The hub lives at /exams/, so site-root assets and pages are one level up.
    root = "../"
    def card(e: dict) -> str:
        badge = "" if is_free(e) else '<span class="hub-badge">Free preview</span>'
        return (
            f'      <li><a class="hub-card" href="{esc(e["id"])}/index.html">'
            f'<span class="hub-code">{esc(exam_code(e))}</span>'
            f'<span class="hub-name">{esc(e.get("fullName") or exam_code(e))}</span>'
            f"{badge}</a></li>"
        )

    cards = "\n".join(card(e) for e in all_exams)
    description = (
        "Free, private, offline practice exams for cloud and security certifications. "
        "Original questions, no account, your data stays in your browser."
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="{THEME_COLOR}">
  <meta name="description" content="{esc(description)}">
  <link rel="canonical" href="{SITE}/exams/">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Examplar">
  <meta property="og:title" content="All practice exams | Examplar">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{SITE}/exams/">
  <meta property="og:image" content="{OG_IMAGE}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="{root}manifest.webmanifest">
  <link rel="apple-touch-icon" href="{root}assets/media/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="64x64" href="{root}assets/media/favicon-64.png">
  <title>All practice exams | Examplar</title>
  <link rel="stylesheet" href="{root}assets/vendor/fontawesome/css/all.min.css">
  <link rel="stylesheet" href="{root}assets/css/exam-landing.css">
  <script src="{root}assets/js/legal-page.js" defer></script>
</head>
<body class="exam-landing">
  <header class="landing-topbar">
    <a class="landing-brand" href="{root}index.html">
      <img src="{root}assets/media/examplar-mark.png" alt="Examplar" width="40" height="36" decoding="async">
      <span>Examplar</span>
    </a>
    <button id="legalThemeToggle" class="landing-theme-toggle" type="button" title="Switch to dark mode" aria-label="Switch to dark mode">
      <i id="legalThemeIcon" aria-hidden="true" class="fas fa-moon"></i>
    </button>
  </header>
  <main class="landing-main">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="{root}index.html">Home</a> <span aria-hidden="true">/</span>
      <span aria-current="page">Exams</span>
    </nav>
    <header class="landing-hero">
      <span class="landing-kicker"><i aria-hidden="true" class="fas fa-graduation-cap"></i> Certification practice</span>
      <h1>Practice exams</h1>
      <p class="landing-intro">{esc(description)}</p>
    </header>
    <ul class="hub-grid">
{cards}
    </ul>
  </main>
  <footer class="landing-footer">
    <nav class="landing-footer-links" aria-label="Site links">
      <a href="{root}index.html">Examplar home</a>
      <a href="{root}privacy-and-storage.html">Privacy &amp; storage</a>
    </nav>
  </footer>
</body>
</html>
"""


def write_site(repo_root: Path = ROOT, src: Path = EXAMS_SRC, index_path: Path = INDEX_JSON,
               template_path: Path = TEMPLATE_PATH) -> int:
    exams = load_exams(index_path, src)
    if not exams:
        raise SystemExit("no exams with metadata found")
    template = template_path.read_text(encoding="utf-8")
    out_dir = repo_root / "exams"
    out_dir.mkdir(parents=True, exist_ok=True)
    for meta in exams:
        page = render_exam_page(meta, exams, template)
        exam_dir = out_dir / meta["id"]
        exam_dir.mkdir(parents=True, exist_ok=True)
        (exam_dir / "index.html").write_text(page, encoding="utf-8", newline="\n")
        print(f"wrote exams/{meta['id']}/index.html")
    (out_dir / "index.html").write_text(render_hub(exams), encoding="utf-8", newline="\n")
    (repo_root / "sitemap.xml").write_text(render_sitemap(exams), encoding="utf-8", newline="\n")
    print(f"wrote exams/index.html and sitemap.xml ({len(exams)} exams)")
    return 0


def main() -> int:
    return write_site(ROOT)


if __name__ == "__main__":
    raise SystemExit(main())
