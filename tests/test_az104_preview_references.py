import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Az104PreviewReferenceTests(unittest.TestCase):
    def test_preview_questions_cite_microsoft_learn(self):
        dump = json.loads(
            (ROOT / "user-content" / "exams" / "az104" / "dump.json").read_text(encoding="utf-8")
        )
        self.assertEqual(len(dump), 20, "AZ-104 preview should have 20 questions")
        for question in dump:
            ref = question.get("reference", "")
            self.assertTrue(
                isinstance(ref, str) and ref.startswith("https://learn.microsoft.com/"),
                f"question {question.get('id')} must cite a Microsoft Learn https reference, got {ref!r}",
            )

    def test_runtime_renders_question_reference(self):
        runtime = (ROOT / "assets" / "js" / "script-multi-exam.js").read_text(encoding="utf-8")
        self.assertIn("renderReferenceLink", runtime, "runtime must define a reference renderer")
        # The renderer must stay gated by the official-documentation allowlist.
        self.assertRegex(
            runtime,
            r"renderReferenceLink\(question\)\s*\{[\s\S]*?isOfficialDocumentationUrl",
        )
        # Wired into both the in-exam feedback and the results review screen.
        self.assertGreaterEqual(runtime.count("this.renderReferenceLink(question)"), 2)


if __name__ == "__main__":
    unittest.main()
