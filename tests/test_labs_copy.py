import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class LabsCopyTests(unittest.TestCase):
    def test_every_home_anchor_uses_the_clean_route_contract(self):
        pages = [ROOT / name for name in ("labs.html", "editor.html", "roadmaps.html", "privacy-and-storage.html")]
        for page_path in pages:
            page = page_path.read_text(encoding="utf-8")
            home_anchors = re.findall(r'<a\b[^>]*href="index\.html"[^>]*>', page)
            self.assertTrue(home_anchors, page_path.name)
            for anchor in home_anchors:
                self.assertIn('data-route="home"', anchor, f"{page_path.name}: {anchor}")

    def test_pack_summary_does_not_promise_a_free_tier_account(self):
        source = (ROOT / "assets" / "js" / "labs.js").read_text(encoding="utf-8")
        page = (ROOT / "labs.html").read_text(encoding="utf-8")

        self.assertNotIn("in your own free-tier account", source)
        self.assertNotIn("free-tier account", page)
        self.assertIn("guided hands-on lab", source)


if __name__ == "__main__":
    unittest.main()
