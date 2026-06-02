import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HomeHeaderLayoutTests(unittest.TestCase):
    def test_home_hero_uses_compact_dashboard_layout(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")

        self.assertRegex(css, r"\.hero-banner__inner\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto;")
        self.assertRegex(css, r"\.hero-banner__inner\s*\{[^}]*padding:\s*1\.05rem\s*1\.35rem;")
        self.assertRegex(css, r"\.hero-banner\s+\.hero-cta-row\s*\{[^}]*display:\s*none;")
        self.assertRegex(css, r"\.hero-banner\s+\.hero-trust\s*\{[^}]*margin:\s*0\.55rem\s*0\s*0;")
        self.assertRegex(css, r"\.hero-banner\s+\.hero-trust\s+\.trust-chip\s*\{[^}]*padding:\s*0\.28rem\s*0\.58rem;")

    def test_image_support_status_does_not_consume_hero_space(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        self.assertIn('id="image-support-flag"', html)
        self.assertRegex(css, r"\.hero-proof\s+\.support-card\s*\{[^}]*display:\s*none;")

    def test_mobile_header_suppresses_trust_chips(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")

        self.assertRegex(
            css,
            r"@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.hero-banner\s+\.hero-trust\s*\{[^}]*display:\s*none;",
        )

    def test_mobile_action_bar_uses_two_column_grid(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")

        self.assertRegex(
            css,
            r"@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.quick-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);",
        )

    def test_mobile_hides_redundant_import_card(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")

        self.assertIn("compact-import-btn", js)
        self.assertRegex(
            css,
            r"@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?#compact-import-btn\s*\{[^}]*display:\s*none;",
        )
