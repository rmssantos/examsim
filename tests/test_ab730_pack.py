import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

# Types the platform renders; ab730 legitimately uses the richer ones.
PLATFORM_TYPES = {"STANDARD", "MULTI", "YES_NO_MATRIX", "SEQUENCE", "DRAG_DROP_SELECT"}


class Ab730PackTests(unittest.TestCase):
    def setUp(self):
        self.dump = json.loads((ROOT / "user-content/exams/ab730/dump.json").read_text(encoding="utf-8"))
        self.meta = json.loads((ROOT / "user-content/exams/ab730/metadata.json").read_text(encoding="utf-8"))

    def test_pack_indexed(self):
        index = json.loads((ROOT / "user-content/exams/index.json").read_text(encoding="utf-8"))
        self.assertIn("ab730", index)

    def test_size_and_official_references(self):
        self.assertGreaterEqual(len(self.dump), 120)
        for q in self.dump:
            ref = q.get("reference", "")
            self.assertTrue(
                isinstance(ref, str) and ref.startswith("https://learn.microsoft.com/"),
                f"{q.get('id')}: bad reference {ref!r}",
            )
            self.assertTrue(q.get("explanation"), f"{q.get('id')}: missing explanation")

    def test_only_platform_question_types(self):
        types = {q.get("question_type") for q in self.dump}
        self.assertTrue(types <= PLATFORM_TYPES, f"unexpected types: {types}")

    def test_three_official_domains(self):
        codes = {d["code"] for d in self.meta.get("objectiveDomains", [])}
        self.assertEqual(codes, {"AB730-1", "AB730-2", "AB730-3"})

    def test_free_microsoft_taxonomy(self):
        self.assertEqual(self.meta.get("commercialStatus"), "free")
        self.assertEqual(self.meta.get("vendor"), "Microsoft")
        self.assertEqual(self.meta.get("certificationCode"), "AB-730")

    def test_total_questions_matches_dump(self):
        self.assertEqual(self.meta.get("totalQuestions"), len(self.dump))


if __name__ == "__main__":
    unittest.main()
