"""Performance, accessibility, and delivery gates for audit Phase 1."""

import json
import re
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


class MetadataFirstLoaderTests(unittest.TestCase):
    def test_bundled_exam_dump_is_lazy_and_concurrent_requests_are_deduplicated(self):
        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            const requests = [];
            global.window = {
              ExamApp: {
                userExams: {},
                isSafeExamId(value) { return /^[a-z0-9_-]+$/i.test(String(value || '')); },
                validateExamData(questions) {
                  return { valid: Array.isArray(questions) && questions.length > 0, errors: [] };
                },
                log() {},
                warn() {}
              }
            };
            global.fetch = async url => {
              requests.push(url);
              if (url.endsWith('/index.json')) {
                return { ok: true, async json() { return ['demo']; } };
              }
              if (url.endsWith('/metadata.json')) {
                return {
                  ok: true,
                  async json() {
                    return { id: 'demo', name: 'Demo', totalQuestions: 1, questionCount: 1 };
                  }
                };
              }
              if (url.endsWith('/dump.json')) {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {
                  ok: true,
                  async json() {
                    return [{ id: 1, question: 'Q', options: ['A', 'B'], correct: 0 }];
                  }
                };
              }
              return { ok: false };
            };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-loader.js', 'utf8'));
            (async () => {
              await window.ExamApp.examsLoadedPromise;
              if (requests.some(url => url.endsWith('/dump.json'))) {
                throw new Error(`startup fetched a dump: ${JSON.stringify(requests)}`);
              }
              const initial = window.userExams.demo;
              if (!initial || initial.questions !== null || initial.loaded !== false) {
                throw new Error('metadata-only entry was not registered');
              }

              const [first, second] = await Promise.all([
                window.ExamApp.ensureExamLoaded('demo'),
                window.ExamApp.ensureExamLoaded('demo')
              ]);
              const dumpRequests = requests.filter(url => url.endsWith('/dump.json'));
              if (dumpRequests.length !== 1) {
                throw new Error(`expected one dump request, got ${dumpRequests.length}`);
              }
              if (first !== second || first !== window.userExams.demo) {
                throw new Error('loader replaced the registered object');
              }
              if (!first.loaded || first.questions.length !== 1) {
                throw new Error('questions were not loaded');
              }
              console.log('metadata-first loader passed');
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("metadata-first loader passed", result.stdout)

    def test_consumers_ensure_questions_before_using_them(self):
        homepage = (ROOT / "assets" / "js" / "homepage.js").read_text(encoding="utf-8")
        exam_init = (ROOT / "assets" / "js" / "exam-init.js").read_text(encoding="utf-8")
        editor = (ROOT / "assets" / "js" / "editor.js").read_text(encoding="utf-8")
        self.assertIn("async selectExam(examId)", homepage)
        self.assertIn("await window.ExamApp.ensureExamLoaded(examId)", homepage)
        self.assertIn("await window.ExamApp.ensureExamLoaded(examId)", exam_init)
        self.assertIn("await window.ExamApp.ensureExamLoaded(newExamId)", editor)


class EditorBootstrapTests(unittest.TestCase):
    def test_editor_bootstrap_is_external_and_cached(self):
        editor_html = (ROOT / "editor.html").read_text(encoding="utf-8")
        service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertNotIn("<script>\n    // Initialize dynamic exam list in editor", editor_html)
        self.assertIn('<script src="assets/js/editor-init.js"></script>', editor_html)
        self.assertIn("./assets/js/editor-init.js", service_worker)


class PageWeightAndAccessibilityTests(unittest.TestCase):
    def test_jszip_is_loaded_only_when_zip_import_is_requested(self):
        index_html = (ROOT / "index.html").read_text(encoding="utf-8")
        homepage = (ROOT / "assets" / "js" / "homepage.js").read_text(encoding="utf-8")
        service_worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertNotIn('<script src="assets/vendor/jszip/jszip.min.js"', index_html)
        self.assertIn("async ensureJsZipLoaded()", homepage)
        self.assertIn("await this.ensureJsZipLoaded()", homepage)
        self.assertIn("./assets/vendor/jszip/jszip.min.js", service_worker)

    def test_primary_pages_have_skip_links_and_main_landmarks(self):
        for page_name in ("index.html", "exam.html", "editor.html"):
            with self.subTest(page=page_name):
                html = (ROOT / page_name).read_text(encoding="utf-8")
                self.assertIn('class="skip-link"', html)
                self.assertIn('href="#main-content"', html)
                self.assertIn('<main id="main-content"', html)

        css = (ROOT / "assets" / "css" / "app-footer.css").read_text(encoding="utf-8")
        self.assertIn(".skip-link:focus-visible", css)

    def test_primary_brand_assets_stay_within_page_weight_budget(self):
        budgets = {
            "logo.png": 100_000,
            "examplar-mark.png": 100_000,
            "icon-512.png": 100_000,
            "icon-192.png": 20_000,
            "apple-touch-icon.png": 20_000,
        }
        for name, max_bytes in budgets.items():
            with self.subTest(asset=name):
                size = (ROOT / "assets" / "media" / name).stat().st_size
                self.assertLessEqual(size, max_bytes, f"{name} is {size} bytes")


class ContentGovernanceTests(unittest.TestCase):
    def test_indexed_packs_have_review_and_objective_metadata(self):
        exam_root = ROOT / "user-content" / "exams"
        exam_ids = json.loads((exam_root / "index.json").read_text(encoding="utf-8"))

        for exam_id in exam_ids:
            with self.subTest(exam=exam_id):
                metadata = json.loads(
                    (exam_root / exam_id / "metadata.json").read_text(encoding="utf-8")
                )
                module_names = {
                    module["name"]
                    for module in metadata.get("modules", [])
                    if isinstance(module, dict) and module.get("name")
                }
                review = metadata.get("contentReview")
                self.assertIsInstance(review, dict)
                self.assertRegex(review.get("lastReviewed", ""), r"^\d{4}-\d{2}-\d{2}$")
                self.assertIn(review.get("reviewCadence"), {"monthly", "quarterly", "biannual", "annual"})
                self.assertRegex(review.get("sourceUrl", ""), r"^https://")
                self.assertTrue(review.get("objectiveVersion"))

                objective_domains = metadata.get("objectiveDomains")
                self.assertIsInstance(objective_domains, list)
                self.assertGreater(len(objective_domains), 0)
                for domain in objective_domains:
                    self.assertTrue(domain.get("code"))
                    self.assertTrue(domain.get("name"))
                    self.assertTrue(domain.get("weightRange"))
                    self.assertRegex(domain.get("sourceUrl", ""), r"^https://")
                    mapped_modules = domain.get("mappedModules")
                    self.assertIsInstance(mapped_modules, list)
                    self.assertGreater(len(mapped_modules), 0)
                    self.assertTrue(set(mapped_modules).issubset(module_names))


class SupplyChainTests(unittest.TestCase):
    ACTION_REF = re.compile(r"^\s*uses:\s*[^@\s]+@([^\s#]+)", re.MULTILINE)

    def test_ci_runs_ruff(self):
        workflow = (ROOT / ".github" / "workflows" / "validate.yml").read_text(encoding="utf-8")
        self.assertIn("ruff check .", workflow)
        self.assertIn("npm run test:browser", workflow)

    def test_workflow_actions_are_pinned_to_commit_shas(self):
        workflows = ROOT / ".github" / "workflows"
        for path in workflows.glob("*.yml"):
            with self.subTest(workflow=path.name):
                refs = self.ACTION_REF.findall(path.read_text(encoding="utf-8"))
                self.assertGreater(len(refs), 0)
                for ref in refs:
                    self.assertRegex(ref, r"^[0-9a-f]{40}$")

    def test_codeql_and_dependabot_are_configured(self):
        codeql = (ROOT / ".github" / "workflows" / "codeql.yml").read_text(encoding="utf-8")
        dependabot = (ROOT / ".github" / "dependabot.yml").read_text(encoding="utf-8")
        self.assertIn("javascript-typescript", codeql)
        self.assertIn("python", codeql)
        self.assertIn("package-ecosystem: github-actions", dependabot)
        self.assertIn("package-ecosystem: npm", dependabot)

    def test_primary_page_script_policies_do_not_allow_arbitrary_inline_code(self):
        for page_name in ("index.html", "exam.html", "editor.html"):
            with self.subTest(page=page_name):
                html = (ROOT / page_name).read_text(encoding="utf-8")
                csp = re.search(
                    r'http-equiv="Content-Security-Policy" content="([^"]+)"',
                    html,
                )
                self.assertIsNotNone(csp)
                script_policy = next(
                    directive
                    for directive in csp.group(1).split(";")
                    if directive.strip().startswith("script-src")
                )
                self.assertNotIn("'unsafe-inline'", script_policy)

    def test_production_security_header_runbook_is_actionable(self):
        runbook = (ROOT / "docs" / "SECURITY-HEADERS.md").read_text(encoding="utf-8")
        for header in (
            "Content-Security-Policy",
            "Referrer-Policy",
            "X-Content-Type-Options",
            "Permissions-Policy",
            "Cross-Origin-Opener-Policy",
        ):
            self.assertIn(header, runbook)
        self.assertIn("npm run test:browser", runbook)
        self.assertIn("curl -I", runbook)


if __name__ == "__main__":
    unittest.main()
