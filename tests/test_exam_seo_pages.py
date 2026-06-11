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

# A pro/preview pack: free 20-question preview plus a paid full pack.
SAMPLE_PRO = {
    "id": "az104",
    "name": "AZ-104",
    "fullName": "Microsoft Azure Administrator",
    "certificationCode": "AZ-104",
    "vendor": "Microsoft",
    "level": "Associate",
    "language": "en",
    "duration": 60,
    "questionCount": 20,
    "totalQuestions": 20,
    "passScore": 70,
    "commercialStatus": "pro-preview",
    "modules": [{"name": "Virtual Machines"}],
    "pro": {
        "title": "AZ-104 Complete",
        "questions": 300,
        "price": "19 EUR",
        "url": "https://examplar.gumroad.com/l/az104-complete",
        "highlights": ["300+ original questions", "Detailed explanations"],
    },
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
        # Assets and in-app links are relative so the page works via file://,
        # server.py, and the deployed root; canonical/og stay absolute.
        self.assertIn('href="../../exam.html?exam=sc900"', page)
        self.assertIn('href="../../assets/css/exam-landing.css"', page)
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
        self.assertIn('href="sc900/index.html"', html_out)
        self.assertIn('href="az900/index.html"', html_out)

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


class StyleTests(unittest.TestCase):
    def test_landing_css_exists_and_scopes_to_landing(self):
        css = (ROOT / "assets" / "css" / "exam-landing.css").read_text(encoding="utf-8")
        self.assertIn(".exam-landing", css)
        self.assertIn(".landing-cta", css)
        self.assertIn(".hub-grid", css)


class HomepageLinkTests(unittest.TestCase):
    def test_homepage_footer_links_to_exams_hub(self):
        html_out = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="/exams/"', html_out)
        self.assertIn("Practice exams", html_out)


class ThemeTests(unittest.TestCase):
    def _render(self, meta):
        template = (ROOT / "tools" / "exam-page-template.html").read_text(encoding="utf-8")
        return gen.render_exam_page(meta, [meta], template)

    def test_pages_wire_shared_theme_toggle(self):
        page = self._render(SAMPLE)
        self.assertIn('id="legalThemeToggle"', page)
        self.assertIn('id="legalThemeIcon"', page)
        self.assertIn("assets/js/legal-page.js", page)

    def test_landing_css_supports_dark_mode(self):
        css = (ROOT / "assets" / "css" / "exam-landing.css").read_text(encoding="utf-8")
        self.assertIn("body.exam-landing.dark-mode", css)

    def test_service_worker_serves_landing_css_fresh(self):
        # exam-landing.css must be precached AND network-first (like the app's
        # other CSS) so style changes appear without a force-refresh. Listing it
        # in both CORE_ASSETS and APP_SHELL_NETWORK_FIRST_ASSETS = two mentions.
        sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertGreaterEqual(sw.count("assets/css/exam-landing.css"), 2)


class PricingTests(unittest.TestCase):
    def _render(self, meta):
        template = (ROOT / "tools" / "exam-page-template.html").read_text(encoding="utf-8")
        return gen.render_exam_page(meta, [meta], template)

    def test_free_pack_is_marked_free(self):
        self.assertTrue(gen.is_free(SAMPLE))
        page = self._render(SAMPLE)
        self.assertIn("(Free, No Sign-up)", page)
        self.assertNotIn("19 EUR", page)
        self.assertEqual(gen.build_pro(SAMPLE), "")

    def test_preview_pack_shows_paid_upgrade_not_fully_free(self):
        self.assertFalse(gen.is_free(SAMPLE_PRO))
        page = self._render(SAMPLE_PRO)
        self.assertIn("Preview", page)            # title reflects preview
        self.assertIn("19 EUR", page)             # price shown
        self.assertIn("AZ-104 Complete", page)    # pro pack name
        self.assertIn("Unlock the full pack", page)
        self.assertNotIn("completely free", page)  # must not over-claim

    def test_preview_jsonld_has_free_and_paid_offers(self):
        payload = json.loads(gen.build_jsonld(SAMPLE_PRO))
        course = next(n for n in payload["@graph"] if n["@type"] == "Course")
        offers = course["offers"]
        self.assertIsInstance(offers, list)
        prices = {o["price"] for o in offers}
        self.assertIn("0", prices)
        self.assertIn("19", prices)

    def test_free_jsonld_has_single_free_offer(self):
        payload = json.loads(gen.build_jsonld(SAMPLE))
        course = next(n for n in payload["@graph"] if n["@type"] == "Course")
        self.assertEqual(course["offers"]["price"], "0")

    def test_preview_copy_avoids_brand_taboo_terms(self):
        for question, answer in gen.faq_pairs(SAMPLE_PRO):
            blob = question + answer
            self.assertNotIn("dump", blob.lower())
            self.assertNotIn("—", blob)

    def test_preview_jsonld_uses_one_currency(self):
        payload = json.loads(gen.build_jsonld(SAMPLE_PRO))
        course = next(n for n in payload["@graph"] if n["@type"] == "Course")
        currencies = {o["priceCurrency"] for o in course["offers"]}
        self.assertEqual(currencies, {"EUR"})  # free + paid share the paid currency


class AnalyticsWiringTests(unittest.TestCase):
    def _render(self, meta):
        template = (ROOT / "tools" / "exam-page-template.html").read_text(encoding="utf-8")
        return gen.render_exam_page(meta, [meta], template)

    def test_pages_load_analytics_with_csp_allowance(self):
        # Landing pages are the SEO entry point; without the analytics client
        # (and a CSP connect-src that permits ingestion) organic traffic is
        # invisible. Mirror the allowance used by index.html.
        for html_out in (self._render(SAMPLE), gen.render_hub([SAMPLE])):
            self.assertIn("assets/js/analytics.js", html_out)
            self.assertIn("assets/css/analytics-privacy.css", html_out)
            self.assertIn(
                "connect-src 'self' https://*.applicationinsights.azure.com", html_out
            )

    def test_pages_load_utils_before_analytics(self):
        # analytics.js delegates host detection to window.ExamApp.isPublicSiteHost,
        # which utils.js defines; without utils.js loaded first the client throws
        # at init and the landing pages stay unmeasured.
        for html_out in (self._render(SAMPLE), gen.render_hub([SAMPLE])):
            self.assertIn("assets/js/utils.js", html_out)
            self.assertLess(
                html_out.index("assets/js/utils.js"),
                html_out.index("assets/js/analytics.js"),
            )

    def test_analytics_classifies_landing_pages(self):
        js = (ROOT / "assets" / "js" / "analytics.js").read_text(encoding="utf-8")
        self.assertIn("'landing'", js)


class KeywordCoverageTests(unittest.TestCase):
    def test_page_covers_both_query_phrasings(self):
        # "practice test" is the higher-volume search variant; it must appear in
        # indexable copy alongside (not replacing) the "practice exam" phrasing.
        template = (ROOT / "tools" / "exam-page-template.html").read_text(encoding="utf-8")
        page = gen.render_exam_page(SAMPLE, [SAMPLE], template).lower()
        self.assertIn("practice exam", page)
        self.assertIn("practice test", page)


class HardeningTests(unittest.TestCase):
    def test_http_url_allows_only_http_schemes(self):
        self.assertEqual(gen.http_url("https://x.test/a"), "https://x.test/a")
        self.assertEqual(gen.http_url("http://x.test"), "http://x.test")
        self.assertIsNone(gen.http_url("javascript:alert(1)"))
        self.assertIsNone(gen.http_url("data:text/html,x"))
        self.assertEqual(gen.http_url("javascript:alert(1)", "#"), "#")

    def test_unsafe_exam_id_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            (src / "sc900").mkdir(parents=True)
            (src / "index.json").write_text(json.dumps(["sc900", "../evil"]), encoding="utf-8")
            (src / "sc900" / "metadata.json").write_text(json.dumps(SAMPLE), encoding="utf-8")
            exams = gen.load_exams(index_path=src / "index.json", src=src)
            self.assertEqual([e["id"] for e in exams], ["sc900"])

    def test_metadata_id_is_forced_to_folder_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            src = tmp_path / "src"
            (src / "sc900").mkdir(parents=True)
            (src / "index.json").write_text(json.dumps(["sc900"]), encoding="utf-8")
            rogue = dict(SAMPLE, id="../../escape")
            (src / "sc900" / "metadata.json").write_text(json.dumps(rogue), encoding="utf-8")
            exams = gen.load_exams(index_path=src / "index.json", src=src)
            self.assertEqual(exams[0]["id"], "sc900")

    def test_resources_skip_non_http_urls(self):
        meta = dict(SAMPLE, resources=[
            {"name": "Bad", "url": "javascript:alert(1)"},
            {"name": "Good", "url": "https://learn.microsoft.com/ok"},
        ])
        out = gen.build_resources(meta)
        self.assertIn("https://learn.microsoft.com/ok", out)
        self.assertNotIn("javascript:", out)

    def test_build_pro_empty_for_free_pack_even_with_pro_block(self):
        free_with_pro = dict(SAMPLE, pro={"title": "X", "price": "9 EUR", "url": "https://x"})
        self.assertTrue(gen.is_free(free_with_pro))
        self.assertEqual(gen.build_pro(free_with_pro), "")

    def test_build_pro_rejects_non_http_url(self):
        meta = dict(SAMPLE_PRO, pro=dict(SAMPLE_PRO["pro"], url="javascript:alert(1)"))
        out = gen.build_pro(meta)
        self.assertNotIn("javascript:", out)
        self.assertIn('href="#"', out)


if __name__ == "__main__":
    unittest.main()
