import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _html_files():
    files = list(ROOT.glob("*.html"))
    files += list((ROOT / "exams").glob("**/*.html"))
    files.append(ROOT / "tools" / "exam-page-template.html")
    return [f for f in files if f.is_file()]


class AnalyticsPrivacyWiringTests(unittest.TestCase):
    def test_mobile_privacy_layout_ships_in_a_fresh_pwa_cache(self):
        service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        version = re.search(
            r"const CACHE_VERSION = 'examsim-pwa-v(?P<major>\d+)\.(?P<minor>\d+)';",
            service_worker,
        )

        self.assertIsNotNone(version)
        self.assertGreaterEqual(
            (int(version.group("major")), int(version.group("minor"))),
            (6, 6),
        )

    def test_privacy_control_moves_clear_of_mobile_next_button(self):
        css = (ROOT / "assets/css/analytics-privacy.css").read_text(encoding="utf-8")

        # Previous and Next occupy the lower edge of the mobile exam screen.
        # Keep the fixed privacy control above that navigation bar.
        mobile_rule = re.search(
            re.compile(
                r"@media\s*\(max-width:\s*760px\)\s*\{"
                r"\s*(?P<selector>\.exam-runtime-page\s+"
                r"\.analytics-privacy-button\s*\{"
                r"(?P<declarations>[^}]*)\})",
            ),
            css,
        )
        self.assertIsNotNone(mobile_rule)
        declarations = mobile_rule.group("declarations")
        self.assertRegex(declarations, r"(?m)^\s*right:\s*12px;")
        self.assertRegex(
            declarations,
            r"(?m)^\s*bottom:\s*calc\(72px\s*\+\s*"
            r"env\(safe-area-inset-bottom,\s*0px\)\);",
        )
        self.assertRegex(declarations, r"(?m)^\s*left:\s*auto;")

        exam_html = (ROOT / "exam.html").read_text(encoding="utf-8")
        self.assertIn('<body class="exam-runtime-page">', exam_html)

    def test_pages_loading_analytics_also_load_the_privacy_stylesheet(self):
        # analytics.js injects the "Privacy settings" button + dialog; without
        # analytics-privacy.css that control renders unstyled in the page flow
        # (the roadmaps/labs bug). Every page that loads the script must load the sheet.
        checked = 0
        for path in _html_files():
            html = path.read_text(encoding="utf-8")
            if "assets/js/analytics.js" not in html:
                continue
            checked += 1
            with self.subTest(page=str(path.relative_to(ROOT))):
                self.assertIn(
                    "assets/css/analytics-privacy.css",
                    html,
                    f"{path.name} loads analytics.js but not analytics-privacy.css, "
                    "so the Privacy settings panel renders unstyled",
                )
        self.assertGreater(checked, 0, "expected at least one page to load analytics.js")


if __name__ == "__main__":
    unittest.main()
