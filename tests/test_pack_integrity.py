import json
import subprocess
import sys
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

    def test_indexed_packs_have_library_taxonomy(self):
        root = ROOT / "user-content" / "exams"
        index = json.loads((root / "index.json").read_text(encoding="utf-8"))
        required_text = {"vendor", "certificationCode", "level", "productFamily", "contentType", "commercialStatus"}
        for exam_id in index:
            metadata = json.loads((root / exam_id / "metadata.json").read_text(encoding="utf-8"))
            for field in required_text:
                self.assertIsInstance(metadata.get(field), str, f"{exam_id} missing {field}")
                self.assertTrue(metadata[field].strip(), f"{exam_id} has blank {field}")
            self.assertIsInstance(metadata.get("domains"), list, f"{exam_id} missing domains")
            self.assertTrue(metadata["domains"], f"{exam_id} has no domains")
            self.assertTrue(all(isinstance(domain, str) and domain.strip() for domain in metadata["domains"]))

    def test_validator_can_print_library_health_report(self):
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "tools" / "validate-exam-packs.py"),
                "--root",
                str(ROOT / "user-content" / "exams"),
                "--health-report",
            ],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Exam library health report", result.stdout)
        self.assertIn("score:", result.stdout)
        self.assertIn("Ready", result.stdout)
        self.assertIn("metadata:", result.stdout)
        self.assertIn("schema:", result.stdout)
        self.assertIn("manifest:", result.stdout)


if __name__ == "__main__":
    unittest.main()
