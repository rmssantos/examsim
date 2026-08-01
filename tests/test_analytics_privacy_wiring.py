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
    def test_privacy_control_moves_clear_of_mobile_next_button(self):
        css = (ROOT / "assets/css/analytics-privacy.css").read_text(encoding="utf-8")

        # The simulator's Next action is anchored on the lower-right of the
        # mobile exam screen. The fixed privacy control must use the opposite
        # edge at this breakpoint so both tap targets remain independent.
        mobile_rule = re.search(
            re.compile(
                r"@media\s*\(max-width:\s*760px\)\s*\{"
                r"\s*(?P<selector>\.analytics-privacy-button\s*\{"
                r"(?P<declarations>[^}]*)\})",
            ),
            css,
        )
        self.assertIsNotNone(mobile_rule)
        declarations = mobile_rule.group("declarations")
        self.assertRegex(declarations, r"(?m)^\s*left:\s*12px;")
        self.assertRegex(declarations, r"(?m)^\s*right:\s*auto;")

        # A later base selector would override the mobile declarations. The
        # mobile rule must therefore be the final direct button rule in the
        # stylesheet's cascade.
        button_rules = list(re.finditer(
            r"(?m)^[ \t]*(?P<selector>\.analytics-privacy-button\s*\{[^}]*\})",
            css,
        ))
        self.assertEqual(button_rules[-1].start("selector"), mobile_rule.start("selector"))

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
