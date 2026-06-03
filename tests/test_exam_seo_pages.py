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


if __name__ == "__main__":
    unittest.main()
