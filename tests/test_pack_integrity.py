import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PackIntegrityTests(unittest.TestCase):
    def test_indexed_packs_have_sha256_manifests(self):
        root = ROOT / "user-content" / "exams"
        index = json.loads((root / "index.json").read_text(encoding="utf-8"))
        self.assertTrue(index, "index.json should list at least one pack")
        for exam_id in index:
            manifest_path = root / exam_id / "manifest.json"
            self.assertTrue(manifest_path.is_file(), f"missing manifest.json for {exam_id}")
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(data.get("algorithm"), "SHA-256")
            self.assertIn("dump.json", data.get("files", {}))

    def test_validate_workflow_enforces_manifests(self):
        workflow = (ROOT / ".github" / "workflows" / "validate.yml").read_text(encoding="utf-8")
        self.assertIn("--check-manifest", workflow)


if __name__ == "__main__":
    unittest.main()
