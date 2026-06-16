import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "roadmaps.html").read_text(encoding="utf-8") if (ROOT / "roadmaps.html").exists() else ""
SW = (ROOT / "service-worker.js").read_text(encoding="utf-8")


class RoadmapsPageTests(unittest.TestCase):
    def test_page_exists(self):
        self.assertTrue(HTML, "roadmaps.html must exist")

    def test_stylesheet_load_order(self):
        order = [m.group(1) for m in re.finditer(r'href="assets/css/([a-z0-9-]+\.css)"', HTML)]
        for name in ("exam-v2.css", "home-v2.css", "roadmaps.css"):
            self.assertIn(name, order, f"{name} must be linked")
        self.assertLess(order.index("exam-v2.css"), order.index("home-v2.css"))
        self.assertLess(order.index("home-v2.css"), order.index("roadmaps.css"))

    def test_control_room_header_present(self):
        self.assertIn("cr-hero-zone", HTML)
        self.assertIn("cr-topnav", HTML)

    def test_containers_present(self):
        self.assertIn('id="roadmap-track-index"', HTML)
        self.assertIn('id="roadmap-track-path"', HTML)

    def test_scripts_present(self):
        for src in ("assets/js/utils.js", "assets/js/analytics.js",
                    "assets/js/exam-storage.js", "assets/js/roadmaps.js"):
            self.assertIn(src, HTML, f"{src} must be loaded")

    def test_service_worker_precaches_roadmap_assets(self):
        for asset in ("./roadmaps.html", "./assets/js/roadmaps.js",
                      "./assets/css/roadmaps.css", "./user-content/roadmaps.json"):
            self.assertIn(asset, SW, f"{asset} must be precached")

    def test_service_worker_version_format(self):
        self.assertRegex(SW, r"examsim-pwa-v\d+\.\d+")


if __name__ == "__main__":
    unittest.main()
