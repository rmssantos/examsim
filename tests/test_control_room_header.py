import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ControlRoomHeaderTests(unittest.TestCase):
    def test_privacy_uses_control_room_topbar(self):
        html = (ROOT / "privacy-and-storage.html").read_text(encoding="utf-8")
        css = (ROOT / "assets/css/legal-page.css").read_text(encoding="utf-8")

        # The privacy page wears the shared control-room sticky top bar with nav links.
        self.assertIn("cr-topbar", html)
        self.assertIn("cr-topnav-links", html)
        self.assertIn('data-route="roadmaps"', html)
        # The theme toggle is preserved (legal-page.js drives it by id).
        self.assertIn('id="legalThemeToggle"', html)
        self.assertIn('id="legalThemeIcon"', html)
        self.assertRegex(css, r"\.cr-topbar\s*\{[^}]*position:\s*sticky;")
        # The bespoke legal header is gone.
        self.assertNotIn("legal-topbar", html)
        self.assertNotIn(".legal-topbar", css)
        self.assertNotIn(".legal-brand", css)

    def test_seo_landing_pages_use_control_room_topbar(self):
        css = (ROOT / "assets/css/exam-landing.css").read_text(encoding="utf-8")
        template = (ROOT / "tools/exam-page-template.html").read_text(encoding="utf-8")
        hub = (ROOT / "exams/index.html").read_text(encoding="utf-8")
        sample = (ROOT / "exams/az900/index.html").read_text(encoding="utf-8")

        self.assertRegex(css, r"\.cr-topbar\s*\{[^}]*position:\s*sticky;")
        # The template, the regenerated hub and a regenerated exam page all carry the bar.
        for label, doc in (("template", template), ("hub", hub), ("az900", sample)):
            with self.subTest(doc=label):
                self.assertIn("cr-topbar", doc)
                self.assertIn("cr-topnav-links", doc)
                self.assertIn('id="legalThemeToggle"', doc)  # theme toggle preserved
        # The bespoke landing header is gone (body sections keep their landing-* classes).
        self.assertNotIn("landing-topbar", template)
        self.assertNotIn("landing-topbar", hub)
        self.assertNotIn(".landing-topbar", css)
        self.assertNotIn(".landing-brand", css)

    def test_all_chrome_pages_share_the_topbar(self):
        # Every page that carries the top nav now uses the same .cr-topbar wrapper.
        for page in ("index.html", "roadmaps.html", "editor.html", "privacy-and-storage.html"):
            with self.subTest(page=page):
                html = (ROOT / page).read_text(encoding="utf-8")
                self.assertIn("cr-topbar", html)
                self.assertIn("cr-topnav-links", html)


if __name__ == "__main__":
    unittest.main()
