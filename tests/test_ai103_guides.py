import importlib.util
import re
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDES = {
    "ai-102-to-ai-103": "AI-102 Is Retired: What Changed in AI-103",
    "ai-103-study-plan": "AI-103 Study Plan: A 30-Day Readiness Path",
}


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = _load_module("generate_exam_pages", ROOT / "tools" / "generate-exam-pages.py")
artifact = _load_module("build_pages_artifact", ROOT / "tools" / "build_pages_artifact.py")


def _relative_luminance(rgb):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    red, green, blue = (channel(value) for value in rgb)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def _contrast_ratio(foreground, background):
    foreground_luminance = _relative_luminance(foreground)
    background_luminance = _relative_luminance(background)
    lighter = max(foreground_luminance, background_luminance)
    darker = min(foreground_luminance, background_luminance)
    return (lighter + 0.05) / (darker + 0.05)


def _hex_rgb(value):
    return tuple(int(value[index:index + 2], 16) for index in (1, 3, 5))


class AI103GuideTests(unittest.TestCase):
    def test_guides_are_publishable_search_pages_with_one_diagnostic_goal(self):
        for slug, heading in GUIDES.items():
            page_path = ROOT / "guides" / slug / "index.html"
            self.assertTrue(page_path.is_file(), f"missing {page_path}")
            page = page_path.read_text(encoding="utf-8")

            self.assertIn(f"<h1>{heading}</h1>", page)
            self.assertIn(
                f'<link rel="canonical" href="https://examplar.app/guides/{slug}/">',
                page,
            )
            self.assertIn("assets/js/analytics.js", page)
            self.assertEqual(page.count('data-analytics-event="landing_cta_clicked"'), 1)
            self.assertIn("exam.html?exam=ai103&amp;session=diagnostic&amp;count=10", page)
            self.assertIn("Start the free AI-103 diagnostic", page)
            self.assertNotIn("real exam questions", page.lower())

    def test_guides_cite_current_microsoft_sources_and_transition_date(self):
        transition = (
            ROOT / "guides" / "ai-102-to-ai-103" / "index.html"
        ).read_text(encoding="utf-8")
        study_plan = (
            ROOT / "guides" / "ai-103-study-plan" / "index.html"
        ).read_text(encoding="utf-8")

        self.assertIn("June 30, 2026", transition)
        self.assertIn("credentials/support/credential-retirement", transition)
        for page in (transition, study_plan):
            self.assertIn("resources/study-guides/ai-103", page)
            self.assertIn("Skills measured as of April 16, 2026", page)

    def test_ai103_landing_links_to_both_guides(self):
        landing = (ROOT / "exams" / "ai103" / "index.html").read_text(encoding="utf-8")
        for slug in GUIDES:
            self.assertIn(f"../../guides/{slug}/", landing)

    def test_relative_directory_links_support_file_mode(self):
        pages = [ROOT / "exams" / "ai103" / "index.html"]
        pages.extend(ROOT / "guides" / slug / "index.html" for slug in GUIDES)

        for page_path in pages:
            page = page_path.read_text(encoding="utf-8")
            for anchor in re.findall(r"<a\b[^>]*>", page):
                href_match = re.search(r'href="([^"]+)"', anchor)
                if not href_match:
                    continue
                href = href_match.group(1)
                if href.startswith(("http://", "https://", "#")):
                    continue
                if href.split("#", 1)[0].split("?", 1)[0].endswith("/"):
                    self.assertIn(
                        "data-file-index",
                        anchor,
                        f"directory link must support file:// in {page_path}: {anchor}",
                    )

    def test_small_guide_labels_meet_wcag_aa_contrast(self):
        css = (ROOT / "assets" / "css" / "exam-landing.css").read_text(
            encoding="utf-8"
        )
        selectors = ("guide-card-label", "guide-step-label")
        light_backgrounds = ((255, 255, 255), (248, 249, 255))

        for selector in selectors:
            block = re.search(rf"\.{selector}\s*\{{([^}}]+)\}}", css)
            self.assertIsNotNone(block, f"missing .{selector} CSS block")
            color_match = re.search(r"color:\s*(#[0-9a-fA-F]{6})", block.group(1))
            self.assertIsNotNone(color_match, f"missing .{selector} text color")
            foreground = _hex_rgb(color_match.group(1))
            for background in light_backgrounds:
                self.assertGreaterEqual(
                    _contrast_ratio(foreground, background),
                    4.5,
                    f".{selector} must meet WCAG AA on {background}",
                )

    def test_sitemap_and_pages_artifact_include_guides(self):
        sitemap = gen.render_sitemap([])
        for slug in GUIDES:
            self.assertIn(f"https://examplar.app/guides/{slug}/", sitemap)
            self.assertIn(f"guides/{slug}/index.html", artifact.PUBLIC_FILES)

        with tempfile.TemporaryDirectory(dir=ROOT / "build") as tmp:
            output = artifact.build(Path(tmp))
            for slug in GUIDES:
                self.assertTrue((output / "guides" / slug / "index.html").is_file())


if __name__ == "__main__":
    unittest.main()
