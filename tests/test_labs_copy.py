import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LabsCopyTests(unittest.TestCase):
    def test_pack_summary_does_not_promise_a_free_tier_account(self):
        source = (ROOT / "assets" / "js" / "labs.js").read_text(encoding="utf-8")
        page = (ROOT / "labs.html").read_text(encoding="utf-8")

        self.assertNotIn("in your own free-tier account", source)
        self.assertNotIn("free-tier account", page)
        self.assertIn("guided hands-on lab", source)


if __name__ == "__main__":
    unittest.main()
