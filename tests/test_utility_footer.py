import unittest
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class UtilityFooterTests(unittest.TestCase):
    def test_homepage_and_editor_expose_project_footer(self):
        for page in ("index.html", "editor.html"):
            html = (ROOT / page).read_text(encoding="utf-8")

            self.assertIn('class="app-footer"', html, page)
            self.assertIn('aria-label="Project and privacy links"', html, page)
            self.assertIn("https://github.com/rmssantos/examsim", html, page)
            self.assertIn("https://github.com/rmssantos/examsim/issues", html, page)
            self.assertIn('href="privacy-and-storage.html"', html, page)
            self.assertIn('data-route="privacy-and-storage"', html, page)
            self.assertNotIn('href="license.html"', html, page)
            self.assertNotIn('data-route="license"', html, page)
            self.assertNotIn('href="PRIVACY-AND-STORAGE.md"', html, page)
            self.assertNotIn('href="LICENSE"', html, page)
            self.assertIn("Offline-ready", html, page)

    def test_footer_privacy_link_renders_as_app_page(self):
        pages = {
            "privacy-and-storage.html": ("Privacy &amp; Data Storage", "Your data stays local"),
        }

        for page, expected_text in pages.items():
            html = (ROOT / page).read_text(encoding="utf-8")

            self.assertIn('<main class="legal-page"', html, page)
            self.assertIn("assets/css/legal-page.css", html, page)
            self.assertIn("assets/css/app-footer.css", html, page)
            self.assertIn('href="index.html"', html, page)
            self.assertIn('data-route="home"', html, page)
            self.assertIn('class="app-nav-action"', html, page)
            for text in expected_text:
                self.assertIn(text, html, page)

    def test_analytics_privacy_dialog_links_to_app_privacy_page(self):
        script = (ROOT / "assets/js/analytics.js").read_text(encoding="utf-8")

        self.assertIn("buildUrl('privacy-and-storage')", script)
        self.assertIn("isFileMode", script)
        self.assertNotIn("docs.href = 'PRIVACY-AND-STORAGE.md'", script)

    def test_analytics_privacy_dialog_preserves_file_mode_links(self):
        node_script = r"""
const fs = require('fs');
const source = fs.readFileSync(process.argv[1], 'utf8')
  .replace('function showPrivacyDialog()', 'window.__privacyNotesUrl = privacyNotesUrl;\n    function showPrivacyDialog()');

function runCase(protocol, hostname, routeResult, isFileMode) {
  const listeners = {};
  global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.navigator = { serviceWorker: null };
  global.fetch = () => Promise.resolve();
  global.HTMLElement = function HTMLElement() {};
  global.document = {
    readyState: 'loading',
    addEventListener(name, handler) { listeners[name] = handler; },
    getElementById() { return null; },
  };
  global.window = {
    location: { protocol, hostname, pathname: '/editor', href: `${protocol}//${hostname}/editor` },
    ExamApp: {
      isPublicSiteHost(host = hostname) {
        return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
      },
      router: {
        buildUrl(route) { return route === 'privacy-and-storage' ? routeResult : ''; },
        isFileMode() { return isFileMode; }
      }
    }
  };
  eval(source);
  return window.__privacyNotesUrl();
}

const results = {
  file: runCase('file:', '', 'privacy-and-storage.html', true),
  public: runCase('https:', 'examplar.app', 'privacy-and-storage.html', false)
};
console.log(JSON.stringify(results));
"""
        result = subprocess.run(
            ["node", "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(
            '{"file":"privacy-and-storage.html","public":"privacy-and-storage"}',
            result.stdout.strip(),
        )

    def test_exam_page_keeps_footer_out_of_active_exam_flow(self):
        html = (ROOT / "exam.html").read_text(encoding="utf-8")

        self.assertNotIn('class="app-footer"', html)

    def test_footer_styles_are_shared_and_cached_offline(self):
        for page in ("index.html", "editor.html"):
            html = (ROOT / page).read_text(encoding="utf-8")
            self.assertIn("assets/css/app-footer.css", html, page)

        css = (ROOT / "assets/css/app-footer.css").read_text(encoding="utf-8")
        self.assertIn(".app-footer", css)
        self.assertIn(".app-nav-action", css)
        self.assertIn('body:not(.dark-mode):not([data-theme="dark"]) .app-footer', css)
        self.assertIn("background: rgba(255, 255, 255, 0.78)", css)
        self.assertIn("box-shadow: 0 14px 28px rgba(15, 23, 42, 0.06)", css)
        self.assertIn("@media (max-width: 720px)", css)
        self.assertIn("width: min(1180px, calc(100% - 24px))", css)
        self.assertNotIn("width: min(100% - 24px, 1180px)", css)

        service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("./assets/css/app-footer.css", service_worker)
        self.assertIn("./assets/css/legal-page.css", service_worker)

    def test_legal_pages_use_clean_route_fallbacks_without_theme_side_effects(self):
        router = (ROOT / "assets/js/router.js").read_text(encoding="utf-8")
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        css = (ROOT / "assets/css/legal-page.css").read_text(encoding="utf-8")
        script = (ROOT / "assets/js/legal-page.js").read_text(encoding="utf-8")

        self.assertIn("'privacy-and-storage': 'privacy-and-storage.html'", router)
        self.assertNotIn("license: 'license.html'", router)
        self.assertIn("'/privacy-and-storage': '/privacy-and-storage.html'", server)
        self.assertNotIn("'/license': '/license.html'", server)
        self.assertIn("width: min(1120px, calc(100% - 24px))", css)
        self.assertIn("width: min(1120px, calc(100% - 8px))", css)
        self.assertNotIn("width: min(100% - 24px, 980px)", css)
        self.assertIn("if (persist) localStorage.setItem('theme', theme);", script)
        self.assertIn("applyTheme(preferredTheme());", script)
        self.assertIn("'dark', true", script)


if __name__ == "__main__":
    unittest.main()
