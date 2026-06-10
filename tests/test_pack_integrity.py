import json
import re
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
        self.assertIn("quality:", result.stdout)

    def test_validator_fails_when_disk_pack_missing_from_index(self):
        # A pack folder absent from index.json is invisible on the static host; the
        # validator must fail loudly on that drift instead of silently skipping it.
        # The listed pack is fully VALID so the nonzero exit is attributable to the
        # drift issue alone, not to an unrelated validation failure.
        import tempfile

        valid_question = [{
            "id": 1,
            "module": "Core",
            "question": "Which option is keyed as correct in this fixture?",
            "options": ["The keyed option", "A distractor", "Another distractor", "A third distractor"],
            "correct": 0,
            "explanation": "The keyed option is correct by construction of this validation fixture.",
            "question_type": "STANDARD",
        }]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            for exam_id in ("listed", "ghostpack"):
                pack = tmp_root / exam_id
                pack.mkdir()
                (pack / "dump.json").write_text(json.dumps(valid_question), encoding="utf-8")
                (pack / "metadata.json").write_text(
                    json.dumps({"id": exam_id, "name": exam_id.upper()}), encoding="utf-8"
                )
            (tmp_root / "index.json").write_text(json.dumps(["listed"]), encoding="utf-8")
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "tools" / "validate-exam-packs.py"),
                    "--root",
                    str(tmp_root),
                ],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("not listed in index.json: ghostpack", result.stdout)
            self.assertIn("Found 1 validation issue(s)", result.stdout,
                          "the drift issue must be the ONLY failure in this fixture")


class PackRegistrySyncTests(unittest.TestCase):
    """The pack id is registered in several hand-maintained lists; they must agree."""

    def setUp(self):
        self.index = set(
            json.loads((ROOT / "user-content" / "exams" / "index.json").read_text(encoding="utf-8"))
        )

    def test_analytics_public_exam_ids_match_index(self):
        analytics = (ROOT / "assets" / "js" / "analytics.js").read_text(encoding="utf-8")
        match = re.search(r"publicExamIds:\s*Object\.freeze\(\[(.*?)\]\)", analytics, re.S)
        self.assertIsNotNone(match, "publicExamIds list not found in analytics.js")
        ids = set(re.findall(r"'([^']+)'", match.group(1)))
        self.assertEqual(ids, self.index, "analytics.js publicExamIds drifted from index.json")

    def test_gitignore_allowlists_every_indexed_pack(self):
        # user-content/exams/* ignores everything; each pack needs BOTH re-include lines:
        # the directory itself AND its contents (/**). Without the second, files inside
        # the pack stay ignored and would silently never be committed.
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        for exam_id in sorted(self.index):
            for pattern in (
                f"!user-content/exams/{exam_id}/",
                f"!user-content/exams/{exam_id}/**",
            ):
                self.assertIn(
                    pattern,
                    gitignore,
                    f"{exam_id} is indexed but missing {pattern!r} in .gitignore "
                    "(pack files would not be committed)",
                )


if __name__ == "__main__":
    unittest.main()
