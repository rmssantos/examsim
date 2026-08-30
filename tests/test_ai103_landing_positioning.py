import importlib.util
import json
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


class AI103LandingPositioningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta = json.loads(
            (ROOT / "user-content" / "exams" / "ai103" / "metadata.json").read_text(
                encoding="utf-8"
            )
        )
        cls.template = (ROOT / "tools" / "exam-page-template.html").read_text(
            encoding="utf-8"
        )
        cls.page = gen.render_exam_page(cls.meta, [cls.meta], cls.template)

    def test_hero_leads_with_ai103_readiness_outcome(self):
        self.assertIn('class="landing-hero landing-hero-featured"', self.page)
        self.assertIn("Find the gaps before AI-103 finds them for you.", self.page)
        self.assertIn("Start free AI-103 diagnostic", self.page)
        self.assertIn("Explore all 25 free questions", self.page)
        self.assertIn(
            "No account. No recalled exam content. Progress stays in your browser.",
            self.page,
        )

    def test_readiness_trace_proves_current_blueprint_coverage(self):
        self.assertIn('class="readiness-trace"', self.page)
        self.assertIn("AI-103 readiness trace", self.page)
        self.assertIn("Skills measured as of April 16, 2026", self.page)
        self.assertIn("Last reviewed June 12, 2026", self.page)

        for domain in self.meta["objectiveDomains"]:
            self.assertIn(domain["name"], self.page)
            self.assertIn(domain["weightRange"], self.page)

    def test_copy_does_not_claim_to_mirror_the_live_exam(self):
        self.assertNotIn("mirrors the real exam format", self.page)
        self.assertIn("timed practice based on the public AI-103 objectives", self.page)

    def test_positioning_markup_has_no_inline_style_or_script(self):
        proof = gen.build_landing_proof(self.meta)
        self.assertNotIn("style=", proof)
        self.assertNotIn("<script", proof)


if __name__ == "__main__":
    unittest.main()
