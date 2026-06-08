import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ClfC02PackTests(unittest.TestCase):
    def setUp(self):
        self.dump = json.loads((ROOT / "user-content/exams/clfc02/dump.json").read_text(encoding="utf-8"))
        self.meta = json.loads((ROOT / "user-content/exams/clfc02/metadata.json").read_text(encoding="utf-8"))

    def test_pack_indexed(self):
        index = json.loads((ROOT / "user-content/exams/index.json").read_text(encoding="utf-8"))
        self.assertIn("clfc02", index)

    def test_size_and_references(self):
        self.assertGreaterEqual(len(self.dump), 120)
        for q in self.dump:
            ref = q.get("reference", "")
            self.assertTrue(
                isinstance(ref, str) and ref.startswith("https://docs.aws.amazon.com/"),
                f"{q.get('id')}: bad reference {ref!r}",
            )
            self.assertTrue(q.get("explanation"), f"{q.get('id')}: missing explanation")

    def test_only_supported_clf_formats(self):
        types = {q.get("question_type") for q in self.dump}
        self.assertTrue(types <= {"STANDARD", "MULTI"}, f"unexpected types: {types}")

    def test_four_official_domains(self):
        codes = {d["code"] for d in self.meta.get("objectiveDomains", [])}
        self.assertEqual(codes, {"CLF-D1", "CLF-D2", "CLF-D3", "CLF-D4"})

    def test_free_taxonomy(self):
        self.assertEqual(self.meta.get("commercialStatus"), "free")
        self.assertEqual(self.meta.get("vendor"), "AWS")
        self.assertEqual(self.meta.get("certificationCode"), "CLF-C02")

    def test_recommends_saac03(self):
        rec = self.meta.get("recommendedPro", {})
        self.assertEqual(rec.get("examId"), "saac03")
        self.assertTrue(str(rec.get("url", "")).startswith("https://"))

    def test_runtime_renders_recommended_pro(self):
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        self.assertIn("renderRecommendedPro", runtime)
        # The exam loader must carry recommendedPro into examData for the render to work.
        loader = (ROOT / "assets/js/exam-init.js").read_text(encoding="utf-8")
        self.assertIn("recommendedPro", loader)


if __name__ == "__main__":
    unittest.main()
