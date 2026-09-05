import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLATFORM_TYPES = {"STANDARD", "MULTI", "YES_NO_MATRIX", "SEQUENCE", "DRAG_DROP_SELECT"}


class Ab620PackTests(unittest.TestCase):
    def setUp(self):
        exam_dir = ROOT / "user-content" / "exams" / "ab620"
        self.dump = json.loads((exam_dir / "dump.json").read_text(encoding="utf-8"))
        self.meta = json.loads((exam_dir / "metadata.json").read_text(encoding="utf-8"))
        self.questions = self.dump["questions"]
        self.labs = self.dump["labs"]

    def test_pack_is_indexed(self):
        index = json.loads((ROOT / "user-content" / "exams" / "index.json").read_text(encoding="utf-8"))
        self.assertIn("ab620", index)

    def test_preview_contract_and_official_references(self):
        self.assertEqual(len(self.questions), 25)
        self.assertEqual(self.meta["questionCount"], 25)
        self.assertEqual(self.meta["totalQuestions"], 25)
        self.assertEqual({q["id"] for q in self.questions}, set(range(1, 26)))
        self.assertTrue({q["question_type"] for q in self.questions} <= PLATFORM_TYPES)
        for question in self.questions:
            self.assertTrue(question.get("explanation"), question.get("id"))
            self.assertTrue(
                question.get("reference", "").startswith("https://learn.microsoft.com/"),
                question.get("id"),
            )

    def test_preview_covers_every_module(self):
        expected = {module["name"] for module in self.meta["modules"]}
        actual = {question["module"] for question in self.questions}
        self.assertEqual(actual, expected)

    def test_one_free_lab_advertises_eight_complete_labs(self):
        self.assertEqual(len(self.labs), 1)
        self.assertEqual(self.meta["labCount"], 1)
        self.assertEqual(self.meta["pro"]["labCount"], 8)
        self.assertEqual(len(self.meta["labTopics"]), 8)
        self.assertEqual(self.labs[0]["id"], "lab-ab620-create-agent")
        self.assertEqual(
            self.meta["pro"]["url"],
            "https://examplar.gumroad.com/l/ab620-complete/EXAMPLAR30",
        )

    def test_objective_domains_match_current_study_guide(self):
        self.assertEqual(
            {domain["code"] for domain in self.meta["objectiveDomains"]},
            {"AB620-D1", "AB620-D2", "AB620-D3"},
        )
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "AB-620 study guide last updated April 21, 2026",
        )


if __name__ == "__main__":
    unittest.main()
