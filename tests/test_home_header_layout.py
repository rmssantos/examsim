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

    def test_local_only_link_can_be_revealed_by_script(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")
        html = (ROOT / "index.html").read_text(encoding="utf-8")

        theme_controls = html[html.index('<div class="theme-controls">'):html.index('</div>', html.index('<div class="theme-controls">'))]
        hero_header = html[html.index('<header class="hero-header hero-banner">'):html.index('</header>', html.index('<header class="hero-header hero-banner">'))]

        self.assertIn("local-only-public-link", theme_controls)
        self.assertNotIn("local-only-public-link", hero_header)
        self.assertRegex(css, r"\.theme-controls\s+\.theme-public-link\s*\{[^}]*height:\s*40px;")
        self.assertNotRegex(css, r"\.theme-controls\s+\.theme-public-link\s*\{[^}]*display:\s*none;")

    def test_local_only_link_has_dark_theme_treatment(self):
        css = (ROOT / "assets/css/index-inline.css").read_text(encoding="utf-8")

        self.assertRegex(css, r"\[data-theme=\"dark\"\]\s+\.theme-controls\s+\.theme-public-link")
        self.assertRegex(css, r"\.dark-mode\s+\.theme-controls\s+\.theme-public-link")
        self.assertRegex(css, r"\[data-theme=\"dark\"\]\s+\.theme-controls\s+\.theme-public-link:hover")

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

    def test_redundant_import_card_is_not_rendered(self):
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")

        self.assertNotIn("showCompactImportButton", js)
        self.assertNotIn("compact-import-btn", js)
        self.assertNotIn("compact-import-btn", css)

    def test_library_drop_target_replaces_import_card(self):
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")

        self.assertRegex(css, r"body\.dragging-file\s+\.exam-library-section::after\s*\{[^}]*Drop exam pack to import")
        self.assertIn("e.target.closest('.exam-library-section')", js)

    def test_file_drops_are_suppressed_outside_library_allowlist(self):
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")

        self.assertIn("const hasDroppedFiles = e.dataTransfer?.files?.length > 0;", js)
        self.assertRegex(
            js,
            r"if\s*\(hasDroppedFiles\)\s*\{\s*e\.preventDefault\(\);",
        )

    def test_library_drag_overlay_has_dark_theme_treatment(self):
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")

        self.assertRegex(css, r"\[data-theme=\"dark\"\]\s+body\.dragging-file\s+\.exam-library-section")
        self.assertRegex(css, r"body\.dark-mode\.dragging-file\s+\.exam-library-section")
        self.assertRegex(css, r"\[data-theme=\"dark\"\]\s+body\.dragging-file\s+\.exam-library-section::after")
        self.assertRegex(css, r"body\.dark-mode\.dragging-file\s+\.exam-library-section::after")

    def test_library_removes_duplicate_add_exam_action(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")

        self.assertNotIn('id="add-exam-btn"', html)
        self.assertNotIn("addExamBtn", js)
        self.assertIn("Create / Edit Exams", html)

    def test_library_content_starts_closer_to_filters(self):
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")

        self.assertRegex(css, r"\.library-controls\.filters-collapsed\s*\{[^}]*margin:\s*0\s+auto\s+0\.45rem;")

    def test_library_title_and_subtitle_share_one_line(self):
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")

        self.assertRegex(css, r"\.section-header\s*>\s*div\s*\{[^}]*display:\s*flex;")
        self.assertRegex(css, r"\.section-header\s*>\s*div\s*\{[^}]*align-items:\s*center;")
        self.assertRegex(css, r"\.section-header\s*>\s*div\s*\{[^}]*gap:\s*0\.8rem;")
        self.assertRegex(css, r"\.section-header\s+h2\s*\{[^}]*margin:\s*0;")

    def test_mobile_library_subtitle_does_not_wrap_below_title(self):
        css = (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8")

        self.assertRegex(
            css,
            r"@media\s*\(max-width:\s*520px\)\s*\{[\s\S]*?\.section-subtitle\s*\{[^}]*display:\s*none;",
        )


if __name__ == "__main__":
    unittest.main()
