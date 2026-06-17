import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HOME = (ROOT / "index.html").read_text(encoding="utf-8")


class RoadmapsHomeEntryTests(unittest.TestCase):
    def test_topnav_has_roadmaps_link(self):
        start = HOME.index('cr-topnav-links')
        nav = HOME[start:HOME.index('</nav>', start)]
        self.assertIn('roadmaps.html', nav, "Topnav must link to roadmaps.html")

    def test_home_board_has_roadmap_entry_card(self):
        self.assertIn('roadmap-entry-card', HOME)
        pattern = re.compile(r'href="roadmaps\.html"[^>]*>(?:(?!</a>).)*Career roadmaps', re.S)
        self.assertRegex(HOME, pattern)


if __name__ == "__main__":
    unittest.main()
