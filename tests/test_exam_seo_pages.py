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


if __name__ == "__main__":
    unittest.main()
