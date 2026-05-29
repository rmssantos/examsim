"""Readiness checks for Sprint 2 (integrity & portability) features."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_validator(root: Path, *extra: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "tools/validate-exam-packs.py", "--root", str(root), *extra],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def make_pack(root: Path, exam_id: str, questions: list) -> Path:
    exam_dir = root / exam_id
    exam_dir.mkdir(parents=True, exist_ok=True)
    (root / "index.json").write_text(json.dumps([exam_id]), encoding="utf-8")
    (exam_dir / "metadata.json").write_text(
        json.dumps(
            {
                "id": exam_id,
                "name": exam_id.upper(),
                "questionCount": len(questions),
                "totalQuestions": len(questions),
            }
        ),
        encoding="utf-8",
    )
    (exam_dir / "dump.json").write_text(json.dumps(questions), encoding="utf-8")
    return exam_dir


class SecureTransferModuleTests(unittest.TestCase):
    def test_module_uses_aes_gcm_pbkdf2_and_sha256(self):
        text = (ROOT / "assets/js/secure-transfer.js").read_text(encoding="utf-8")
        for token in ("AES-GCM", "PBKDF2", "SHA-256", "examsim-encrypted", "promptPassphrase"):
            self.assertIn(token, text)
        # Must use DOM-safe APIs, never innerHTML, for the passphrase modal.
        self.assertNotIn("innerHTML", text)
        self.assertIn("createElement", text)
        self.assertIn("textContent", text)
        self.assertIn("aria-labelledby", text)
        self.assertIn("aria-describedby", text)

    def test_module_is_wired_into_pages_and_service_worker(self):
        for page in ("index.html", "exam.html", "editor.html"):
            page_text = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn("assets/js/secure-transfer.js", page_text, page)
        sw_text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("./assets/js/secure-transfer.js", sw_text)

    def test_utils_exposes_confirm_helper(self):
        text = (ROOT / "assets/js/utils.js").read_text(encoding="utf-8")
        self.assertIn("window.showCustomConfirm", text)
        self.assertIn("aria-labelledby", text)
        self.assertIn("aria-describedby", text)


class StorageHydrationTests(unittest.TestCase):
    def test_exam_storage_has_progress_hydration(self):
        text = (ROOT / "assets/js/exam-storage.js").read_text(encoding="utf-8")
        self.assertIn("hydrateProgressMirror", text)

    def test_homepage_hydrates_on_init(self):
        text = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        self.assertIn("hydrateProgressFromIndexedDB", text)
        self.assertIn("hydrateProgressMirror", text)


class EncryptedTransferWiringTests(unittest.TestCase):
    def test_export_supports_encrypted_variant(self):
        text = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        self.assertIn("secureTransfer", text)
        self.assertIn(".encrypted.json", text)
        self.assertIn("promptPassphrase", text)

    def test_import_detects_encrypted_and_progress_backups(self):
        text = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        self.assertIn("isEncryptedEnvelope", text)
        self.assertIn("restoreProgressBackup", text)


class ManifestTests(unittest.TestCase):
    def test_manifest_write_and_check_roundtrip_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = make_pack(
                root,
                "demo",
                [{"id": "q1", "question": "2+2?", "question_type": "STANDARD", "options": ["3", "4"], "correct": 1}],
            )

            write = run_validator(root, "--write-manifest")
            self.assertEqual(write.returncode, 0, write.stdout)
            manifest_path = exam_dir / "manifest.json"
            self.assertTrue(manifest_path.is_file())
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["algorithm"], "SHA-256")
            self.assertIn("dump.json", manifest["files"])

            clean = run_validator(root, "--check-manifest")
            self.assertEqual(clean.returncode, 0, clean.stdout)

            (exam_dir / "dump.json").write_text(
                json.dumps([{"id": "q1", "question": "changed", "question_type": "STANDARD", "options": ["3", "4"], "correct": 1}]),
                encoding="utf-8",
            )
            tampered = run_validator(root, "--check-manifest")
            self.assertEqual(tampered.returncode, 1, tampered.stdout)
            self.assertIn("hash mismatch", tampered.stdout)

    def test_manifest_check_rejects_unsafe_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = make_pack(
                root,
                "demo",
                [{"id": "q1", "question": "2+2?", "question_type": "STANDARD", "options": ["3", "4"], "correct": 1}],
            )
            (exam_dir / "manifest.json").write_text(
                json.dumps(
                    {
                        "format": "examsim-manifest",
                        "version": 1,
                        "algorithm": "SHA-256",
                        "files": {"../outside.json": "0" * 64},
                    }
                ),
                encoding="utf-8",
            )

            result = run_validator(root, "--check-manifest")
            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("unsafe manifest path", result.stdout)


class AdvancedQuestionTypeTests(unittest.TestCase):
    def assert_pack(self, questions, *, should_pass):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            make_pack(root, "demo", questions)
            result = run_validator(root)
            if should_pass:
                self.assertEqual(result.returncode, 0, result.stdout)
            else:
                self.assertEqual(result.returncode, 1, result.stdout)
            return result

    def test_multi_valid_and_invalid(self):
        self.assert_pack(
            [{"id": "m1", "question": "Pick", "question_type": "MULTI", "options": ["a", "b", "c"], "correct": [0, 2]}],
            should_pass=True,
        )
        self.assert_pack(
            [{"id": "m1", "question": "Pick", "question_type": "MULTI", "options": ["a", "b"], "correct": [5]}],
            should_pass=False,
        )

    def test_sequence_valid_and_invalid(self):
        self.assert_pack(
            [{"id": "s1", "question": "Order", "question_type": "SEQUENCE", "options": ["a", "b", "c"], "correct": [2, 0, 1]}],
            should_pass=True,
        )
        self.assert_pack(
            [{"id": "s1", "question": "Order", "question_type": "SEQUENCE", "options": ["a", "b", "c"], "correct": [0, 0, 1]}],
            should_pass=False,
        )

    def test_drag_drop_select_valid_and_invalid(self):
        self.assert_pack(
            [{
                "id": "d1",
                "question": "Drag",
                "question_type": "DRAG_DROP_SELECT",
                "options": ["a", "b", "c"],
                "correct": [0, 1],
                "drag_select_required": 2,
            }],
            should_pass=True,
        )
        self.assert_pack(
            [{
                "id": "d1",
                "question": "Drag",
                "question_type": "DRAG_DROP_SELECT",
                "options": ["a", "b"],
                "correct": [9],
            }],
            should_pass=False,
        )

    def test_yes_no_matrix_valid_and_invalid(self):
        self.assert_pack(
            [{
                "id": "y1",
                "question": "Matrix",
                "question_type": "YES_NO_MATRIX",
                "statements": ["s1", "s2"],
                "correct": [1, 0],
            }],
            should_pass=True,
        )
        self.assert_pack(
            [{
                "id": "y1",
                "question": "Matrix",
                "question_type": "YES_NO_MATRIX",
                "statements": ["s1", "s2"],
                "correct": [1, 2],
            }],
            should_pass=False,
        )


if __name__ == "__main__":
    unittest.main()
