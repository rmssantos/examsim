import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UtilityFooterTests(unittest.TestCase):
    def test_homepage_and_editor_expose_project_footer(self):
        for page in ("index.html", "editor.html"):
            html = (ROOT / page).read_text(encoding="utf-8")

            self.assertIn('class="app-footer"', html, page)
            self.assertIn('aria-label="Project and privacy links"', html, page)
            self.assertIn("https://github.com/rmssantos/examsim", html, page)
            self.assertIn("https://github.com/rmssantos/examsim/issues", html, page)
            self.assertIn("PRIVACY-AND-STORAGE.md", html, page)
            self.assertIn("LICENSE", html, page)
            self.assertIn("Offline-ready", html, page)

    def test_exam_page_keeps_footer_out_of_active_exam_flow(self):
        html = (ROOT / "exam.html").read_text(encoding="utf-8")

        self.assertNotIn('class="app-footer"', html)

    def test_footer_styles_are_shared_and_cached_offline(self):
        for page in ("index.html", "editor.html"):
            html = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn("assets/css/app-footer.css", html, page)

        css = (ROOT / "assets/css/app-footer.css").read_text(encoding="utf-8")
        self.assertIn(".app-footer", css)
        self.assertIn("@media (max-width: 720px)", css)

        service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("./assets/css/app-footer.css", service_worker)


if __name__ == "__main__":
    unittest.main()
