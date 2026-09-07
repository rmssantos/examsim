"""The downloadable edition must not contain a configured telemetry client."""

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LocalPrivacyTests(unittest.TestCase):
    def test_runtime_and_page_sources_have_no_telemetry_wiring(self):
        paths = list((ROOT / "assets/js").glob("*.js"))
        paths += list(ROOT.glob("*.html"))
        paths += list((ROOT / "exams").rglob("*.html"))
        paths += list((ROOT / "guides").rglob("*.html"))
        paths += [ROOT / "service-worker.js", ROOT / "tools/exam-page-template.html"]
        forbidden = re.compile(
            r"analytics\.js|analytics-privacy\.css|data-analytics-|"
            r"APPINSIGHTS_CONNECTION_STRING|applicationinsights\.azure\.com|"
            r"ExamApp\??\.analytics|exam_google_ads_click_ids"
        )
        matches = [path.relative_to(ROOT).as_posix() for path in paths
                   if forbidden.search(path.read_text(encoding="utf-8"))]
        self.assertEqual([], matches, "Local source must have no telemetry implementation or wiring")

    def test_distribution_has_no_telemetry_files_or_configuration_injector(self):
        for relative in ("assets/js/analytics.js", "assets/css/analytics-privacy.css",
                         "tools/inject-analytics-secret.py"):
            with self.subTest(path=relative):
                self.assertFalse((ROOT / relative).exists())
        workflow = (ROOT / ".github/workflows/validate.yml").read_text(encoding="utf-8")
        self.assertNotIn("inject-analytics", workflow)


if __name__ == "__main__":
    unittest.main()
