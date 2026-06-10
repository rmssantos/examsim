import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CUSTOM = "./custom-packs/${encodeURIComponent(code)}.json"
LEGACY = "./exam-dumps/${encodeURIComponent(code)}.json"


class CustomPackLoadingContractTests(unittest.TestCase):
    """custom-packs/ is the supported drop-in location; exam-dumps/ stays as a silent
    legacy fallback (promised in custom-packs/README.md). Pin both paths and their order."""

    def _assert_contract(self, source_path):
        source = source_path.read_text(encoding="utf-8")
        self.assertIn(CUSTOM, source, f"{source_path.name} must load from custom-packs/ first")
        self.assertIn(LEGACY, source, f"{source_path.name} must keep the legacy exam-dumps/ fallback")
        self.assertLess(
            source.index(CUSTOM), source.index(LEGACY),
            f"{source_path.name} must try custom-packs/ before the legacy folder",
        )

    def test_exam_runtime_loads_custom_packs_with_legacy_fallback(self):
        self._assert_contract(ROOT / "assets" / "js" / "script-multi-exam.js")

    def test_editor_loads_custom_packs_with_legacy_fallback(self):
        self._assert_contract(ROOT / "assets" / "js" / "editor.js")

    def test_custom_packs_folder_ships_with_readme(self):
        readme = ROOT / "custom-packs" / "README.md"
        self.assertTrue(readme.is_file())
        text = readme.read_text(encoding="utf-8")
        self.assertIn("custom-packs/", text)
        self.assertIn("fallback", text)


if __name__ == "__main__":
    unittest.main()
