# Per-exam SEO landing pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one static, SEO-rich landing page per exam (plus an `/exams/` hub and a refreshed `sitemap.xml`) from the existing `metadata.json`, so each exam can rank in search and funnel users into the current app.

**Architecture:** A dependency-free Python build tool (`tools/generate-exam-pages.py`) reads `user-content/exams/index.json` + each `metadata.json`, renders pure-HTML fragments and a `string.Template` skeleton, and writes `exams/<id>/index.html`, `exams/index.html`, and `sitemap.xml`. Output is committed; CI re-runs the tool and fails on drift. The change is purely additive: no app JS, routing, or existing URL changes. Landing pages only link out to the working `exam.html?exam=<id>`.

**Tech Stack:** Python 3.10 standard library only (`pathlib`, `json`, `html`, `string.Template`); `unittest` for tests (matching the repo, run via `python -m unittest discover -s tests`). Static HTML/CSS output served by GitHub Pages.

---

## File structure

- Create: `tools/generate-exam-pages.py` — the generator (loading, fragment builders, renderers, `write_site`, `main`).
- Create: `tools/exam-page-template.html` — `string.Template` skeleton for a single exam page.
- Create: `assets/css/exam-landing.css` — landing-page styling only.
- Create: `tests/test_exam_seo_pages.py` — unittest coverage + anti-drift freshness check.
- Generated + committed: `exams/<id>/index.html` (one per exam), `exams/index.html` (hub), `sitemap.xml` (overwrite the placeholder created earlier).
- Modify: `index.html` — add ONE crawlable footer link to `/exams/`.
- Modify: `.github/workflows/deploy-pages.yml` — run the generator before upload.
- Modify: `.github/workflows/validate.yml` — add the tool to the py_compile step.
- Modify: `.gitattributes` — pin LF for generated HTML + sitemap (deterministic bytes across platforms).

Metadata fields available (confirmed from `user-content/exams/sc900/metadata.json`): `id, name, fullName, duration, questionCount, totalQuestions, passScore, language, badge, icon, vendor, certificationCode, domains[], level, modules[{icon,name}], resources[{icon,name,url}], objectiveDomains[{code,name,weightRange}]`. Not every exam has every field, so every builder must degrade gracefully (use `.get`, skip empty sections).

---

## Task 1: Generator module — loading + primitives

**Files:**
- Create: `tools/generate-exam-pages.py`
- Test: `tests/test_exam_seo_pages.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_exam_seo_pages.py
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_generator():
    spec = importlib.util.spec_from_file_location(
        "generate_exam_pages", ROOT / "tools" / "generate-exam-pages.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = _load_generator()

SAMPLE = {
    "id": "sc900",
    "name": "SC-900",
    "fullName": "Microsoft Security, Compliance, and Identity Fundamentals",
    "certificationCode": "SC-900",
    "vendor": "Microsoft",
    "level": "Fundamentals",
    "language": "en",
    "duration": 45,
    "questionCount": 50,
    "totalQuestions": 150,
    "passScore": 70,
    "modules": [{"name": "Microsoft Entra"}, {"name": "Azure Security"}],
    "resources": [
        {"name": "Microsoft Learn SC-900 Study Guide", "url": "https://learn.microsoft.com/sc-900"}
    ],
    "objectiveDomains": [
        {"code": "SCI-1", "name": "Describe security concepts", "weightRange": "10-15%"}
    ],
}


class PrimitiveTests(unittest.TestCase):
    def test_esc_escapes_html(self):
        self.assertEqual(gen.esc('a & "b" <c>'), "a &amp; &quot;b&quot; &lt;c&gt;")

    def test_exam_code_prefers_certification_code(self):
        self.assertEqual(gen.exam_code(SAMPLE), "SC-900")
        self.assertEqual(gen.exam_code({"id": "x", "name": "X-1"}), "X-1")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_exam_seo_pages -v`
Expected: FAIL — `FileNotFoundError` for `tools/generate-exam-pages.py` (module load fails).

- [ ] **Step 3: Write minimal implementation**

```python
# tools/generate-exam-pages.py
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_exam_seo_pages -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add tools/generate-exam-pages.py tests/test_exam_seo_pages.py
git commit -m "feat(seo): exam page generator skeleton with metadata loading"
```

---

## Task 2: Content fragment builders

**Files:**
- Modify: `tools/generate-exam-pages.py`
- Test: `tests/test_exam_seo_pages.py`

- [ ] **Step 1: Write the failing test** (append this class)

```python
class FragmentTests(unittest.TestCase):
    def test_facts_table_has_known_rows(self):
        html_out = gen.build_facts(SAMPLE)
        self.assertIn("Microsoft", html_out)
        self.assertIn("45 min", html_out)
        self.assertIn("70%", html_out)
        self.assertIn("<table", html_out)

    def test_sections_render_when_present(self):
        self.assertIn("Microsoft Entra", gen.build_modules(SAMPLE))
        self.assertIn("10-15%", gen.build_domains(SAMPLE))
        self.assertIn("learn.microsoft.com", gen.build_resources(SAMPLE))

    def test_sections_empty_when_absent(self):
        bare = {"id": "x", "name": "X-1"}
        self.assertEqual(gen.build_modules(bare), "")
        self.assertEqual(gen.build_domains(bare), "")
        self.assertEqual(gen.build_resources(bare), "")

    def test_faq_pairs_avoid_brand_taboo_terms(self):
        for question, answer in gen.faq_pairs(SAMPLE):
            blob = (question + answer).lower()
            self.assertNotIn("dump", blob)
            self.assertNotIn("—", question + answer)  # no em-dash

    def test_crosslinks_exclude_self(self):
        other = dict(SAMPLE, id="az900", name="AZ-900", certificationCode="AZ-900")
        out = gen.build_crosslinks(SAMPLE, [SAMPLE, other])
        self.assertIn("/exams/az900/", out)
        self.assertNotIn("/exams/sc900/", out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_exam_seo_pages.FragmentTests -v`
Expected: FAIL — `AttributeError: module has no attribute 'build_facts'`.

- [ ] **Step 3: Write minimal implementation** (append to `tools/generate-exam-pages.py`)

```python
def build_facts(meta: dict) -> str:
    pairs = [
        ("Vendor", meta.get("vendor")),
        ("Certification", exam_code(meta)),
        ("Level", meta.get("level") or meta.get("badge")),
        ("Questions per attempt", meta.get("questionCount")),
        ("Question bank", meta.get("totalQuestions")),
        ("Time limit", f"{meta.get('duration')} min" if meta.get("duration") else None),
        ("Pass score", f"{meta.get('passScore')}%" if meta.get("passScore") else None),
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
        f'      <li><a href="{SITE}/exams/{esc(e["id"])}/">'
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_exam_seo_pages.FragmentTests -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/generate-exam-pages.py tests/test_exam_seo_pages.py
git commit -m "feat(seo): content fragment builders for exam pages"
```

---

## Task 3: JSON-LD, metadata text, and full page render

**Files:**
- Modify: `tools/generate-exam-pages.py`
- Create: `tools/exam-page-template.html`
- Test: `tests/test_exam_seo_pages.py`

- [ ] **Step 1: Write the failing test** (append this class)

```python
class RenderTests(unittest.TestCase):
    def _render(self):
        template = (ROOT / "tools" / "exam-page-template.html").read_text(encoding="utf-8")
        return gen.render_exam_page(SAMPLE, [SAMPLE], template)

    def test_jsonld_is_valid_with_expected_types(self):
        payload = json.loads(gen.build_jsonld(SAMPLE))
        types = {node["@type"] for node in payload["@graph"]}
        self.assertEqual(types, {"Course", "BreadcrumbList", "FAQPage"})

    def test_page_has_core_seo_markup(self):
        page = self._render()
        self.assertIn("<title>SC-900 Practice Exam (Free, No Sign-up) | Examplar</title>", page)
        self.assertIn('<link rel="canonical" href="https://examplar.app/exams/sc900/">', page)
        self.assertIn("<h1>SC-900 Practice Exam</h1>", page)
        self.assertIn('href="https://examplar.app/exam.html?exam=sc900"', page)
        self.assertIn('application/ld+json', page)
        self.assertIn("Microsoft Entra", page)  # modules section present

    def test_page_has_no_unsubstituted_placeholders(self):
        self.assertNotIn("$", self._render())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_exam_seo_pages.RenderTests -v`
Expected: FAIL — `AttributeError: module has no attribute 'build_jsonld'` (and template file missing).

- [ ] **Step 3a: Create the template file**

Create `tools/exam-page-template.html` (every `$name` is a `string.Template` placeholder; the file contains no other `$`):

```html
<!DOCTYPE html>
<html lang="$lang">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="$theme_color">
  <meta name="description" content="$description">
  <link rel="canonical" href="$canonical">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Examplar">
  <meta property="og:title" content="$og_title">
  <meta property="og:description" content="$og_description">
  <meta property="og:url" content="$og_url">
  <meta property="og:image" content="$og_image">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="$og_title">
  <meta name="twitter:description" content="$og_description">
  <meta name="twitter:image" content="$og_image">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/assets/media/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/media/favicon-64.png">
  <title>$title</title>
  <link rel="stylesheet" href="/assets/vendor/fontawesome/css/all.min.css">
  <link rel="stylesheet" href="/assets/css/app-footer.css">
  <link rel="stylesheet" href="/assets/css/exam-landing.css">
  <script type="application/ld+json">
$jsonld
  </script>
</head>
<body class="exam-landing">
  <header class="landing-topbar">
    <a class="landing-brand" href="/">
      <img src="/assets/media/examplar-mark.png" alt="Examplar" width="40" height="36" decoding="async">
      <span>Examplar</span>
    </a>
  </header>
  <main class="landing-main">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span>
      <a href="/exams/">Exams</a> <span aria-hidden="true">/</span>
      <span aria-current="page">$exam_code</span>
    </nav>
    <header class="landing-hero">
      <h1>$exam_code Practice Exam</h1>
      <p class="landing-subhead">$full_name</p>
      <p class="landing-intro">$intro</p>
      <a class="landing-cta" href="$cta_url"><i aria-hidden="true" class="fas fa-play"></i> Start practicing free</a>
    </header>
$facts
$domains
$modules
$resources
$faq
$crosslinks
  </main>
  <footer class="landing-footer app-footer" aria-label="Site links">
    <div class="app-footer-inner">
      <nav class="app-footer-links" aria-label="Site links">
        <a href="/">Examplar home</a>
        <a href="/exams/">All practice exams</a>
        <a href="/privacy-and-storage.html">Privacy &amp; storage</a>
      </nav>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 3b: Add renderers** (append to `tools/generate-exam-pages.py`)

```python
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
```

Note: `Template.substitute` raises `KeyError`/`ValueError` if the template has an unknown or malformed placeholder. That is desirable — it surfaces template typos at build time.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tests.test_exam_seo_pages.RenderTests -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/generate-exam-pages.py tools/exam-page-template.html tests/test_exam_seo_pages.py
git commit -m "feat(seo): render full exam page with JSON-LD from template"
```

---

## Task 4: Hub, sitemap, and write_site orchestration (with anti-drift test)

**Files:**
- Modify: `tools/generate-exam-pages.py`
- Test: `tests/test_exam_seo_pages.py`

- [ ] **Step 1: Write the failing test** (append this class)

```python
class SiteTests(unittest.TestCase):
    def test_sitemap_lists_home_hub_and_each_exam(self):
        xml = gen.render_sitemap([SAMPLE, dict(SAMPLE, id="az900")])
        self.assertIn("<loc>https://examplar.app/</loc>", xml)
        self.assertIn("<loc>https://examplar.app/exams/</loc>", xml)
        self.assertIn("<loc>https://examplar.app/exams/sc900/</loc>", xml)
        self.assertIn("<loc>https://examplar.app/exams/az900/</loc>", xml)
        self.assertIn("<loc>https://examplar.app/privacy-and-storage.html</loc>", xml)

    def test_hub_links_every_exam(self):
        html_out = gen.render_hub([SAMPLE, dict(SAMPLE, id="az900", certificationCode="AZ-900")])
        self.assertIn("/exams/sc900/", html_out)
        self.assertIn("/exams/az900/", html_out)

    def test_write_site_produces_files_for_missing_metadata_safely(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            (src / "sc900").mkdir(parents=True)
            (src / "index.json").write_text(json.dumps(["sc900", "ghost"]), encoding="utf-8")
            (src / "sc900" / "metadata.json").write_text(json.dumps(SAMPLE), encoding="utf-8")
            out = tmp_path / "out"
            gen.write_site(out, src=src, index_path=src / "index.json")
            self.assertTrue((out / "exams" / "sc900" / "index.html").is_file())
            self.assertFalse((out / "exams" / "ghost").exists())  # missing metadata skipped
            self.assertTrue((out / "sitemap.xml").is_file())

    def test_committed_output_is_up_to_date(self):
        """Anti-drift: regenerate into a temp dir and compare to committed files."""
        def norm(text):
            return text.replace("\r\n", "\n")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            gen.write_site(tmp_path)  # real source, temp output
            for generated in (tmp_path / "exams").rglob("*.html"):
                rel = generated.relative_to(tmp_path)
                committed = ROOT / rel
                self.assertTrue(committed.is_file(), f"missing {rel}; run the generator")
                self.assertEqual(
                    norm(committed.read_text(encoding="utf-8")),
                    norm(generated.read_text(encoding="utf-8")),
                    f"{rel} is stale; run: python tools/generate-exam-pages.py",
                )
            self.assertEqual(
                norm((ROOT / "sitemap.xml").read_text(encoding="utf-8")),
                norm((tmp_path / "sitemap.xml").read_text(encoding="utf-8")),
                "sitemap.xml is stale; run: python tools/generate-exam-pages.py",
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_exam_seo_pages.SiteTests -v`
Expected: FAIL — `AttributeError: module has no attribute 'render_sitemap'`. (`test_committed_output_is_up_to_date` will also fail until Task 6 generates the files; that is expected and is the anti-drift guard.)

- [ ] **Step 3: Write minimal implementation** (append to `tools/generate-exam-pages.py`)

```python
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
    cards = "\n".join(
        f'      <li><a class="hub-card" href="{SITE}/exams/{esc(e["id"])}/">'
        f'<span class="hub-code">{esc(exam_code(e))}</span>'
        f'<span class="hub-name">{esc(e.get("fullName") or exam_code(e))}</span></a></li>'
        for e in all_exams
    )
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
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/assets/media/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="64x64" href="/assets/media/favicon-64.png">
  <title>All practice exams | Examplar</title>
  <link rel="stylesheet" href="/assets/vendor/fontawesome/css/all.min.css">
  <link rel="stylesheet" href="/assets/css/app-footer.css">
  <link rel="stylesheet" href="/assets/css/exam-landing.css">
</head>
<body class="exam-landing">
  <header class="landing-topbar">
    <a class="landing-brand" href="/">
      <img src="/assets/media/examplar-mark.png" alt="Examplar" width="40" height="36" decoding="async">
      <span>Examplar</span>
    </a>
  </header>
  <main class="landing-main">
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span>
      <span aria-current="page">Exams</span>
    </nav>
    <header class="landing-hero">
      <h1>Practice exams</h1>
      <p class="landing-intro">{esc(description)}</p>
    </header>
    <ul class="hub-grid">
{cards}
    </ul>
  </main>
  <footer class="landing-footer app-footer" aria-label="Site links">
    <div class="app-footer-inner">
      <nav class="app-footer-links" aria-label="Site links">
        <a href="/">Examplar home</a>
        <a href="/privacy-and-storage.html">Privacy &amp; storage</a>
      </nav>
    </div>
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
```

- [ ] **Step 4: Run test to verify the unit tests pass**

Run: `python -m unittest tests.test_exam_seo_pages.SiteTests.test_sitemap_lists_home_hub_and_each_exam tests.test_exam_seo_pages.SiteTests.test_hub_links_every_exam tests.test_exam_seo_pages.SiteTests.test_write_site_produces_files_for_missing_metadata_safely -v`
Expected: PASS. (`test_committed_output_is_up_to_date` still fails — fixed in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add tools/generate-exam-pages.py tests/test_exam_seo_pages.py
git commit -m "feat(seo): hub, sitemap, and write_site orchestration"
```

---

## Task 5: Landing page stylesheet

**Files:**
- Create: `assets/css/exam-landing.css`

- [ ] **Step 1: Create the stylesheet**

Reuse the existing palette (theme color `#1e3c72`). Keep it self-contained so it does not affect any existing page (no global selectors beyond `.exam-landing` scope, except a minimal `body` reset already namespaced).

```css
/* Landing pages for SEO (exams/index.html and exams/<id>/index.html). */
body.exam-landing {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #0f172a;
  background: #f8fafc;
  line-height: 1.6;
}
.exam-landing .landing-topbar {
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: #1e3c72;
}
.exam-landing .landing-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #fff;
  text-decoration: none;
  font-weight: 700;
}
.exam-landing .landing-main {
  width: min(880px, calc(100% - 32px));
  margin: 0 auto;
  padding: 32px 0 48px;
}
.exam-landing .breadcrumbs {
  font-size: 0.9rem;
  color: #475569;
  margin-bottom: 16px;
}
.exam-landing .breadcrumbs a { color: #1e3c72; text-decoration: none; }
.exam-landing .landing-hero h1 { font-size: 2.1rem; margin: 0 0 4px; }
.exam-landing .landing-subhead { font-size: 1.15rem; color: #334155; margin: 0 0 16px; }
.exam-landing .landing-intro { font-size: 1.05rem; color: #334155; }
.exam-landing .landing-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 12px 22px;
  background: #1e3c72;
  color: #fff;
  border-radius: 10px;
  text-decoration: none;
  font-weight: 600;
}
.exam-landing .landing-cta:hover { background: #16305c; }
.exam-landing .exam-section { margin-top: 32px; }
.exam-landing .exam-section h2 { font-size: 1.35rem; margin-bottom: 12px; }
.exam-landing .exam-facts {
  width: 100%;
  border-collapse: collapse;
  margin-top: 24px;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
}
.exam-landing .exam-facts caption {
  text-align: left;
  font-weight: 600;
  padding: 12px 16px;
  background: #eef2f7;
}
.exam-landing .exam-facts th,
.exam-landing .exam-facts td { text-align: left; padding: 10px 16px; border-top: 1px solid #e2e8f0; }
.exam-landing .exam-facts th { width: 45%; color: #475569; font-weight: 600; }
.exam-landing .exam-domains,
.exam-landing .exam-modules,
.exam-landing .exam-resources,
.exam-landing .exam-crosslinks { padding-left: 20px; }
.exam-landing .exam-domains li,
.exam-landing .exam-modules li,
.exam-landing .exam-resources li,
.exam-landing .exam-crosslinks li { margin: 6px 0; }
.exam-landing .domain-weight { color: #1e3c72; font-weight: 600; }
.exam-landing .faq-item { background: #fff; border-radius: 8px; padding: 10px 16px; margin: 8px 0; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
.exam-landing .faq-item summary { cursor: pointer; font-weight: 600; }
.exam-landing .hub-grid { list-style: none; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); margin-top: 24px; }
.exam-landing .hub-card { display: flex; flex-direction: column; gap: 4px; padding: 18px; background: #fff; border-radius: 12px; text-decoration: none; color: inherit; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08); }
.exam-landing .hub-card:hover { box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12); }
.exam-landing .hub-code { font-weight: 700; color: #1e3c72; }
.exam-landing .hub-name { font-size: 0.92rem; color: #475569; }
.exam-landing .landing-footer { margin-top: 48px; }
```

- [ ] **Step 2: Add a smoke test** (append this class to `tests/test_exam_seo_pages.py`)

```python
class StyleTests(unittest.TestCase):
    def test_landing_css_exists_and_scopes_to_landing(self):
        css = (ROOT / "assets" / "css" / "exam-landing.css").read_text(encoding="utf-8")
        self.assertIn(".exam-landing", css)
        self.assertIn(".landing-cta", css)
        self.assertIn(".hub-grid", css)
```

- [ ] **Step 3: Run test**

Run: `python -m unittest tests.test_exam_seo_pages.StyleTests -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add assets/css/exam-landing.css tests/test_exam_seo_pages.py
git commit -m "feat(seo): landing-page stylesheet"
```

---

## Task 6: Generate and commit the real output + pin line endings

**Files:**
- Modify: `.gitattributes`
- Generated: `exams/**`, `sitemap.xml`

- [ ] **Step 1: Pin LF for generated output** (append to `.gitattributes`)

```gitattributes
# Generated SEO landing pages and sitemap: pin LF so the anti-drift check
# (tests/test_exam_seo_pages.py) compares identical bytes on every platform.
exams/**/*.html text eol=lf
sitemap.xml text eol=lf
robots.txt text eol=lf
```

- [ ] **Step 2: Run the generator**

Run: `python tools/generate-exam-pages.py`
Expected output: one `wrote exams/<id>/index.html` line per exam in `index.json` (sc900, ab730, ab731, az900, az104), then `wrote exams/index.html and sitemap.xml (5 exams)`.

- [ ] **Step 3: Verify generated files**

Run: `python -c "import pathlib,glob; print([p for p in glob.glob('exams/**/*.html', recursive=True)])"`
Expected: `exams/index.html` plus `exams/sc900/index.html`, `exams/ab730/index.html`, `exams/ab731/index.html`, `exams/az900/index.html`, `exams/az104/index.html`.

Run: `python -c "import xml.dom.minidom; xml.dom.minidom.parse('sitemap.xml'); print('sitemap valid')"`
Expected: `sitemap valid`.

- [ ] **Step 4: Run the full test file (anti-drift now passes)**

Run: `python -m unittest tests.test_exam_seo_pages -v`
Expected: ALL PASS, including `test_committed_output_is_up_to_date`.

- [ ] **Step 5: Commit**

```bash
git add .gitattributes exams sitemap.xml
git commit -m "feat(seo): generate exam landing pages, hub, and sitemap"
```

---

## Task 7: Homepage footer link to /exams/ (crawl path)

**Files:**
- Modify: `index.html` (footer nav at `index.html:500-513`)
- Test: `tests/test_exam_seo_pages.py`

- [ ] **Step 1: Write the failing test** (append this class)

```python
class HomepageLinkTests(unittest.TestCase):
    def test_homepage_footer_links_to_exams_hub(self):
        html_out = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/exams/"', html_out)
        self.assertIn("Practice exams", html_out)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tests.test_exam_seo_pages.HomepageLinkTests -v`
Expected: FAIL — `href="/exams/"` not found.

- [ ] **Step 3: Add the link** — in `index.html`, inside the footer nav `<nav class="app-footer-links" ...>`, add as the first link before the GitHub "Source" link:

```html
					<a href="/exams/">
						<i aria-hidden="true" class="fas fa-list"></i>
						<span>Practice exams</span>
					</a>
```

The block becomes:

```html
				<nav class="app-footer-links" aria-label="Project links">
					<a href="/exams/">
						<i aria-hidden="true" class="fas fa-list"></i>
						<span>Practice exams</span>
					</a>
					<a href="https://github.com/rmssantos/examsim" target="_blank" rel="noopener noreferrer">
						<i aria-hidden="true" class="fab fa-github"></i>
						<span>Source</span>
					</a>
```

Note: an absolute `/exams/` link works for crawlers and on the live site; the SPA router does not intercept it (it has no `data-route`), so behaviour is unchanged. In `file:` preview it will not resolve, which is acceptable (this link targets the deployed site).

- [ ] **Step 4: Run test + existing footer test to verify nothing broke**

Run: `python -m unittest tests.test_exam_seo_pages.HomepageLinkTests tests.test_utility_footer -v`
Expected: PASS (new link present; existing footer assertions still hold).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/test_exam_seo_pages.py
git commit -m "feat(seo): link homepage footer to the exams hub"
```

---

## Task 8: CI integration

**Files:**
- Modify: `.github/workflows/deploy-pages.yml`
- Modify: `.github/workflows/validate.yml`

- [ ] **Step 1: Add generation step to deploy** — in `.github/workflows/deploy-pages.yml`, add BEFORE the `Upload artifact` step:

```yaml
      - name: Generate per-exam SEO pages
        run: python tools/generate-exam-pages.py
```

- [ ] **Step 2: Add the tool to the compile check** — in `.github/workflows/validate.yml`, extend the `Compile Python tools` step file list:

```yaml
      - name: Compile Python tools
        run: python -m py_compile server.py tools/generate-exam-data-js.py tools/generate-exam-pages.py tools/inject-analytics-secret.py tools/validate-exam-packs.py
```

(The anti-drift test `test_committed_output_is_up_to_date` already runs through the existing `Run repository tests` step, so stale committed output fails CI automatically.)

- [ ] **Step 3: Verify the workflows are valid YAML**

Run: `python -c "import yaml,sys; [yaml.safe_load(open(p)) for p in ('.github/workflows/deploy-pages.yml','.github/workflows/validate.yml')]; print('workflows ok')"`
Expected: `workflows ok`. (If PyYAML is unavailable locally, skip; CI will parse them.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-pages.yml .github/workflows/validate.yml
git commit -m "ci(seo): generate exam pages on deploy and compile-check the tool"
```

---

## Task 9: Non-breaking verification (manual + automated)

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — confirm nothing existing regressed.

Run: `python -m unittest discover -s tests -v`
Expected: all tests pass (existing + new `test_exam_seo_pages`).

- [ ] **Step 2: Pack validation still green** (unchanged data, but confirm the new top-level `exams/` did not confuse anything).

Run: `python tools/validate-exam-packs.py --root user-content/exams`
Expected: success, same as before.

- [ ] **Step 3: Local preview of the new pages and existing app** — start the dev server and check by hand.

Run: `python server.py` (then browse)
Expected:
- `http://localhost:8000/exams/` shows the hub with all 5 exams.
- `http://localhost:8000/exams/sc900/` shows the SC-900 page (H1, facts, domains, FAQ) and the CTA points to `exam.html?exam=sc900`.
- Clicking the CTA opens the existing exam flow and starts SC-900.
- `http://localhost:8000/` (home), `/editor`, `/privacy-and-storage`, and starting an exam all behave exactly as before.

- [ ] **Step 4: Service worker sanity** — confirm the SW is untouched and the new pages are not precached (they should load from network).

Run: `python -c "t=open('service-worker.js',encoding='utf-8').read(); assert '/exams/' not in t, 'SW should not reference /exams/'; print('SW unchanged')"`
Expected: `SW unchanged`. Manually confirm in the browser that offline behaviour of the app is unchanged (the landing pages are online content and need no offline support).

- [ ] **Step 5: Structured data spot check** — copy the JSON-LD from one generated page into the Google Rich Results Test (https://search.google.com/test/rich-results) and confirm Course + FAQ + Breadcrumb are detected with no errors. (Manual, post-deploy or via paste.)

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(seo): verification fixes for exam landing pages"
```

---

## Self-review notes

- **Spec coverage:** generator (Tasks 1-4), template (Task 3), rich content + JSON-LD Course/Breadcrumb/FAQ (Tasks 2-3), hub + sitemap ownership (Task 4), committed output + LF pinning (Task 6), homepage internal link (Task 7), CSS (Task 5), build/CI wiring + anti-drift (Tasks 6-8), non-breaking verification incl. SW/server/existing tests (Task 9). All spec sections map to a task.
- **Out of scope (per spec):** Font Awesome subset / CSS minify (separate perf track), Search Console submission (manual), homepage card anchor rewrite (phase 2).
- **Type/name consistency:** `write_site(repo_root, src, index_path, template_path)`, `render_exam_page(meta, all_exams, template)`, `build_jsonld(meta)`, `faq_pairs(meta)`, `exam_code(meta)`, `esc(value)` are used consistently across tasks and tests.
- **Determinism:** all writes use `newline="\n"`; `.gitattributes` pins LF; the anti-drift test normalizes CRLF before comparing.
