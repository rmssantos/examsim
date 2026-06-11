import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

PLATFORM_TYPES = {"STANDARD", "MULTI", "YES_NO_MATRIX", "SEQUENCE", "DRAG_DROP_SELECT"}


class Dp700PackTests(unittest.TestCase):
    def setUp(self):
        self.dump = json.loads((ROOT / "user-content/exams/dp700/dump.json").read_text(encoding="utf-8"))
        self.meta = json.loads((ROOT / "user-content/exams/dp700/metadata.json").read_text(encoding="utf-8"))

    def test_pack_indexed(self):
        index = json.loads((ROOT / "user-content/exams/index.json").read_text(encoding="utf-8"))
        self.assertIn("dp700", index)

    def test_size_and_references(self):
        # The preview is contractually 25 questions; guard against metadata/content drift.
        self.assertEqual(len(self.dump), 25)
        self.assertEqual(self.meta.get("totalQuestions"), len(self.dump))
        self.assertEqual(self.meta.get("questionCount"), len(self.dump))
        for q in self.dump:
            ref = q.get("reference", "")
            self.assertTrue(
                isinstance(ref, str) and ref.startswith("https://learn.microsoft.com/"),
                f"{q.get('id')}: bad reference {ref!r}",
            )
            self.assertTrue(q.get("explanation"), f"{q.get('id')}: missing explanation")

    def test_only_supported_formats(self):
        types = {q.get("question_type") for q in self.dump}
        self.assertTrue(types <= PLATFORM_TYPES, f"unexpected types: {types}")

    def test_three_official_domains(self):
        codes = {d["code"] for d in self.meta.get("objectiveDomains", [])}
        self.assertEqual(codes, {"DP700-D1", "DP700-D2", "DP700-D3"})

    def test_pro_preview_funnel(self):
        self.assertEqual(self.meta.get("commercialStatus"), "pro-preview")
        self.assertEqual(self.meta.get("certificationCode"), "DP-700")
        self.assertEqual(self.meta.get("vendor"), "Microsoft")
        self.assertEqual(self.meta.get("contentOrigin"), "original")
        # The homepage gates the "Preview" lock flag (exam-card--preview) on metadata.preview.
        self.assertIs(self.meta.get("preview"), True)
        pro = self.meta.get("pro")
        self.assertIsInstance(pro, dict, "pro-preview pack must carry a pro funnel block")
        self.assertTrue(str(pro.get("url", "")).startswith("https://"), "pro funnel needs a purchase url")
        self.assertEqual(pro.get("questions"), 280)


if __name__ == "__main__":
    unittest.main()
