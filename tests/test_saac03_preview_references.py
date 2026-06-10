import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Saac03PreviewReferenceTests(unittest.TestCase):
    def test_preview_questions_cite_official_aws_docs(self):
        dump = json.loads(
            (ROOT / "user-content" / "exams" / "saac03" / "dump.json").read_text(encoding="utf-8")
        )
        questions = dump["questions"] if isinstance(dump, dict) else dump
        self.assertEqual(len(questions), 25, "SAA-C03 preview should have 25 questions")
        for question in questions:
            ref = question.get("reference", "")
            self.assertTrue(
                isinstance(ref, str)
                and (ref.startswith("https://docs.aws.amazon.com/")
                     or ref.startswith("https://aws.amazon.com/")),
                f"question {question.get('id')} must cite an official AWS https reference, got {ref!r}",
            )
            self.assertTrue(question.get("explanation"), f"question {question.get('id')} missing explanation")


if __name__ == "__main__":
    unittest.main()
