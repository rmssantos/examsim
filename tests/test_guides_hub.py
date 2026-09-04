import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GUIDE_SLUGS = (
    "ai-102-to-ai-103",
    "ai-103-labs-and-foundry-practice",
    "ai-103-study-plan",
    "ai-900-to-ai-901",
)


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gen = _load_module("generate_exam_pages", ROOT / "tools" / "generate-exam-pages.py")
artifact = _load_module("build_pages_artifact", ROOT / "tools" / "build_pages_artifact.py")


class GuidesHubTests(unittest.TestCase):
    def test_guides_hub_is_a_publishable_search_page(self):
        page_path = ROOT / "guides" / "index.html"
        self.assertTrue(page_path.is_file(), "missing public /guides/ index")
        page = page_path.read_text(encoding="utf-8")

        self.assertIn("<title>Azure AI Certification Guides: AI-103 &amp; AI-901 | Examplar</title>", page)
        self.assertIn('<link rel="canonical" href="https://examplar.app/guides/">', page)
        self.assertIn('<meta property="og:url" content="https://examplar.app/guides/">', page)
        self.assertIn("<h1>AI-103 and AI-901 certification guides</h1>", page)
        self.assertIn("assets/js/analytics.js", page)
        self.assertNotIn("noindex", page.lower())
        self.assertIn("AI-103: Azure AI apps and agents", page)
        self.assertIn("AI-901: Azure AI Fundamentals", page)

        for slug in GUIDE_SLUGS:
            self.assertIn(f'href="{slug}/" data-file-index', page)

        for exam_id in ("ai103", "ai901"):
            self.assertIn(f'href="../exams/{exam_id}/" data-file-index', page)
            self.assertIn(
                f'href="../exam.html?exam={exam_id}&amp;session=diagnostic&amp;count=10"',
                page,
            )

    def test_guides_hub_is_deployed_and_listed_in_the_sitemap(self):
        self.assertIn("guides/index.html", artifact.PUBLIC_FILES)
        sitemap = gen.render_sitemap([])
        self.assertEqual(
            1,
            sitemap.count("<loc>https://examplar.app/guides/</loc>"),
        )

        build_root = ROOT / "build"
        build_root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=build_root) as tmp:
            output = artifact.build(Path(tmp))
            self.assertTrue((output / "guides" / "index.html").is_file())

    def test_primary_navigation_exposes_the_guides_hub(self):
        homepage = (ROOT / "index.html").read_text(encoding="utf-8")
        exam_hub = (ROOT / "exams" / "index.html").read_text(encoding="utf-8")
        exam_template = (ROOT / "tools" / "exam-page-template.html").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            'href="guides/index.html" data-route="guides">Guides</a>',
            homepage,
        )
        self.assertIn('href="../guides/" data-file-index>Guides</a>', exam_hub)
        self.assertIn(
            'href="${root}guides/" data-file-index>Guides</a>',
            exam_template,
        )

        for slug in GUIDE_SLUGS:
            article = (ROOT / "guides" / slug / "index.html").read_text(
                encoding="utf-8"
            )
            self.assertIn('href="../" data-file-index>Guides</a>', article)

    def test_home_guides_route_is_clean_when_hosted_and_file_safe(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        script_path = ROOT / "assets" / "js" / "router.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');

function buildGuidesUrl(protocol, pathname, controlled) {
  const sandbox = {
    window: { ExamApp: {}, location: { protocol, pathname } },
    navigator: { serviceWorker: { controller: controlled ? {} : null } },
    document: {
      readyState: 'loading',
      addEventListener() {},
      querySelectorAll() { return []; }
    },
    URLSearchParams
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.ExamApp.router.buildUrl('guides');
}

console.log(JSON.stringify({
  fileMode: buildGuidesUrl('file:', '/C:/examplar/index.html', false),
  hostedFirstLoad: buildGuidesUrl('https:', '/index.html', false),
  hostedControlled: buildGuidesUrl('https:', '/index.html', true)
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(script_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )

        self.assertEqual(
            {
                "fileMode": "guides/index.html",
                "hostedFirstLoad": "/guides/",
                "hostedControlled": "/guides/",
            },
            json.loads(result.stdout),
        )


if __name__ == "__main__":
    unittest.main()
