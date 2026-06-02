import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ProPackTests(unittest.TestCase):
    def test_az104_is_a_preview_pack(self):
        meta = json.loads((ROOT / "user-content/exams/az104/metadata.json").read_text(encoding="utf-8"))
        self.assertTrue(meta.get("preview"), "az104 should be flagged as a preview pack")
        self.assertIn("pro", meta)
        self.assertIn("url", meta["pro"])
        self.assertTrue(meta["pro"].get("highlights"), "pro upsell should list highlights")

        dump = json.loads((ROOT / "user-content/exams/az104/dump.json").read_text(encoding="utf-8"))
        self.assertLessEqual(len(dump), 20, "preview should ship at most 20 questions")

    def test_homepage_renders_preview_flag_and_pro_modal(self):
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        self.assertIn("exam-preview-flag", js)
        self.assertIn("exam-card-unlock", js)
        self.assertIn("showProModal", js)
        # The "import & activate" path reuses the existing import (which decrypts envelopes).
        self.assertIn("triggerFileImport", js)

    def test_homepage_exposes_metadata_driven_library_filters(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")

        for element_id in (
            "library-search",
            "library-filter-vendor",
            "library-filter-domain",
            "library-filter-level",
            "library-filter-status",
            "library-filter-toggle",
            "library-filter-toggle-label",
            "library-search-control",
            "library-advanced-filters",
            "library-filter-count",
            "library-sort",
            "library-result-count",
            "details-exam-taxonomy",
        ):
            self.assertIn(element_id, html)

        self.assertIn("renderLibraryFilterOptions", js)
        self.assertIn("getExamTaxonomy", js)
        self.assertIn("getFilteredSortedExams", js)
        self.assertIn("updateLibraryFilterPanel", js)
        self.assertIn("filtersCollapsed", js)
        self.assertIn("filtersCollapsed: true", js)
        self.assertIn("library-controls filters-collapsed", html)
        self.assertIn('aria-expanded="false"', html)
        self.assertIn("Show search and filters", js)
        self.assertIn("Search & filters", js)
        self.assertIn("metadata.vendor", js)
        self.assertIn("metadata.domains", js)
        self.assertIn("createExamTaxonomy", js)
        self.assertIn("exam-taxonomy-chip", js)
        self.assertIn("variant: 'details'", js)
        self.assertNotIn("exam-card-import", js)
        self.assertIn("e.target.closest('.exam-library-section')", js)
        self.assertIn("Drop exam pack to import", (ROOT / "assets/css/homepage-styles.css").read_text(encoding="utf-8"))
        self.assertIn("formatCommercialStatus", js)

    def test_encrypt_pack_tool_round_trips(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")
        tool = ROOT / "tools/encrypt-pack.js"
        self.assertTrue(tool.is_file())

        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            pack = [{"id": 1, "question": "Q?", "options": ["a", "b"], "correct": 0}]
            (tmp / "dump.json").write_text(json.dumps(pack), encoding="utf-8")
            env = tmp / "env.json"
            out = tmp / "out.json"
            key = "test-license-key"

            enc = subprocess.run(
                [node, str(tool), "encrypt", "--in", str(tmp / "dump.json"),
                 "--id", "demo", "--key", key, "--out", str(env)],
                capture_output=True, text=True)
            self.assertEqual(enc.returncode, 0, enc.stderr)

            envelope = json.loads(env.read_text(encoding="utf-8"))
            self.assertEqual(envelope.get("format"), "examsim-encrypted")
            self.assertEqual(envelope.get("cipher"), "AES-GCM")
            for field in ("salt", "iv", "data"):
                self.assertIn(field, envelope)

            dec = subprocess.run(
                [node, str(tool), "decrypt", "--in", str(env), "--key", key, "--out", str(out)],
                capture_output=True, text=True)
            self.assertEqual(dec.returncode, 0, dec.stderr)
            restored = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(restored["id"], "demo")
            self.assertEqual(restored["questions"], pack)

            # Wrong key must fail.
            bad = subprocess.run(
                [node, str(tool), "decrypt", "--in", str(env), "--key", "wrong-key-xxx", "--out", str(out)],
                capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0, "decryption with the wrong key should fail")

            # The key can also come from the environment (keeps it out of argv).
            import os
            os_env = dict(os.environ, ENCRYPT_PACK_KEY=key)
            env_out = tmp / "env-out.json"
            enc_env = subprocess.run(
                [node, str(tool), "encrypt", "--in", str(tmp / "dump.json"), "--id", "demo", "--out", str(env_out)],
                capture_output=True, text=True, env=os_env)
            self.assertEqual(enc_env.returncode, 0, enc_env.stderr)
            self.assertEqual(json.loads(env_out.read_text(encoding="utf-8")).get("format"), "examsim-encrypted")


if __name__ == "__main__":
    unittest.main()
