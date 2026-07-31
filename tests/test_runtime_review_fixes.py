"""Focused regressions for runtime findings raised during PR review."""

import textwrap
import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet
except ImportError:
    from node_harness import run_node_snippet


ROOT = Path(__file__).resolve().parents[1]


class RuntimeReviewFixTests(unittest.TestCase):
    def run_node(self, script: str, *paths: Path):
        self.assertEqual(1, len(paths), "runtime snippets require one source file")
        return run_node_snippet(
            paths[0],
            textwrap.dedent(script),
            timeout=30,
        )

    def test_shared_resource_urls_are_https_and_trust_aware(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: {
                hostname: 'localhost',
                search: '',
                href: 'https://examplar.app/',
                origin: 'https://examplar.app'
              }
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {}
            };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            const bundled = { source: 'bundled', trust: 'bundled' };
            const imported = { source: 'imported', trust: 'local-unverified' };
            console.log(JSON.stringify({
              bundledExternal: window.ExamApp.resourceUrlForTrust(
                'https://example.com/reference',
                bundled
              ),
              importedOfficial: window.ExamApp.resourceUrlForTrust(
                'https://learn.microsoft.com/training',
                imported
              ),
              importedExternal: window.ExamApp.resourceUrlForTrust(
                'https://example.com/reference',
                imported
              ),
              http: window.ExamApp.safeExternalUrl('http://example.com/reference'),
              credentials: window.ExamApp.safeExternalUrl(
                'https://user:pass@example.com/reference'
              ),
              script: window.ExamApp.safeExternalUrl('javascript:alert(1)')
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertEqual(
            "https://example.com/reference",
            payload["bundledExternal"],
        )
        self.assertEqual(
            "https://learn.microsoft.com/training",
            payload["importedOfficial"],
        )
        self.assertIsNone(payload["importedExternal"])
        self.assertIsNone(payload["http"])
        self.assertIsNone(payload["credentials"])
        self.assertIsNone(payload["script"])

    def test_url_callers_use_the_shared_helpers(self):
        homepage = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        labs = (ROOT / "assets/js/labs.js").read_text(encoding="utf-8")
        roadmaps = (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8")

        self.assertNotIn("\nsafeExternalUrl(url) {", homepage)
        self.assertNotIn("\nresourceUrlForExam(url, examData) {", homepage)
        self.assertNotIn("function safeHref(", labs)
        self.assertNotIn("function safeHref(", roadmaps)
        self.assertNotIn("function roadmapResourceHref(", roadmaps)
        self.assertIn("window.ExamApp.resourceUrlForTrust(", homepage)
        self.assertGreaterEqual(homepage.count("this.renderResourceLinks("), 2)
        self.assertIn("window.ExamApp.resourceUrlForTrust(", labs)
        self.assertIn("window.ExamApp.resourceUrlForTrust(", roadmaps)

    def test_homepage_uses_completion_time_and_renders_filtered_empty_state(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            function makeNode(tagName = '') {
              const node = {
                tagName,
                children: [],
                className: '',
                textContent: '',
                appendChild(child) {
                  this.children.push(child);
                  return child;
                },
                setAttribute() {}
              };
              Object.defineProperty(node, 'innerHTML', {
                get() { return ''; },
                set(_) { this.children = []; }
              });
              return node;
            }
            const resourcesList = makeNode('div');
            global.window = {
              location: {
                hostname: 'localhost',
                protocol: 'https:',
                search: '',
                href: 'https://examplar.app/',
                origin: 'https://examplar.app'
              },
              ExamApp: {
                EXAM_LIMITS: {},
                getProgressSummary() {
                  return { completionAttempts: 2, bestScore: 80, passRate: 50 };
                },
                resourceUrlForTrust() { return null; },
                warn() {}
              }
            };
            global.document = {
              baseURI: 'https://examplar.app/',
              addEventListener() {},
              getElementById() { return null; },
              querySelector() { return null; },
              querySelectorAll() { return []; },
              createElement: makeNode,
              createTextNode(value) { return { textContent: String(value) }; }
            };
            const progress = {
              attempts: [
                { sessionType: 'diagnostic', score: 50, timeSpent: 5 },
                { sessionType: 'full', score: 70, timeSpent: 40 },
                { sessionType: 'study', score: 80, timeSpent: 60 }
              ]
            };
            global.localStorage = {
              getItem(key) {
                return key === 'alpha_progress' ? JSON.stringify(progress) : null;
              },
              setItem() {},
              removeItem() {}
            };
            const source = fs.readFileSync(process.argv[1], 'utf8');
            vm.runInThisContext(
              source + '\n;globalThis.RuntimeHomePage = HomePage;',
              { filename: process.argv[1] }
            );
            const homeInstance = Object.create(globalThis.RuntimeHomePage.prototype);
            homeInstance.resourcesList = resourcesList;
            homeInstance.renderResources(
              [{ name: 'Untrusted', url: 'https://evil.example/reference' }],
              { source: 'imported', trust: 'local-unverified' }
            );
            const stats = homeInstance.getProgressStats('alpha');
            console.log(JSON.stringify({
              avgTime: stats.avgTime,
              resourceChildren: resourcesList.children.map((child) => ({
                tagName: child.tagName,
                className: child.className,
                textContent: child.textContent
              }))
            }));
            """,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertEqual(50, payload["avgTime"])
        self.assertEqual(
            [
                {
                    "tagName": "p",
                    "className": "muted",
                    "textContent": (
                        "Add resource links in metadata to show quick shortcuts."
                    ),
                }
            ],
            payload["resourceChildren"],
        )

    def test_malformed_legacy_labs_are_not_persisted_during_migration(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const writes = [];
            global.window = {
              indexedDB: null,
              ExamApp: {
                isSafeExamId() { return true; },
                sanitizeExamMetadata(value) { return value; },
                warn() {},
                analytics: { trackStorageMigration() {} },
                addToRegistry() {},
                STORAGE_KEYS: { exams: 'exam_registry' }
              }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {},
              key() { return null; },
              length: 0
            };
            vm.runInThisContext(
              fs.readFileSync(process.argv[1], 'utf8'),
              { filename: process.argv[1] }
            );
            async function migrate(labs, metadata = { name: 'Alpha' }) {
              const storage = new window.ExamApp.ExamStorage();
              storage.getRecord = async () => null;
              storage.getLegacyExam = () => ({
                examId: 'alpha',
                questions: [{ id: 1 }],
                metadata,
                labs,
                source: 'imported',
                trust: 'local-unverified',
                storage: 'localStorage'
              });
              storage.putExam = async (...args) => {
                writes.push({
                  metadata: args[2],
                  options: args[3]
                });
                return true;
              };
              return storage.getExam('alpha');
            }
            (async () => {
              const invalidResult = await migrate('{invalid json');
              const validResult = await migrate([{ id: 'lab-1' }]);
              const advertisedResult = await migrate(
                '{invalid json',
                { name: 'Alpha', labCount: 1 }
              );
              const absentResult = await migrate(
                undefined,
                { name: 'Alpha', labCount: 1 }
              );
              const mismatchedResult = await migrate(
                [{ id: 'lab-1' }],
                { name: 'Alpha', labCount: 2 }
              );
              console.log(JSON.stringify({
                invalidHasLabs: Object.prototype.hasOwnProperty.call(
                  writes[0].options,
                  'labs'
                ),
                invalidReturnedHasLabs: Object.prototype.hasOwnProperty.call(
                  invalidResult,
                  'labs'
                ),
                validLabs: writes[1].options.labs,
                validMetadataLabCount: writes[1].metadata.labCount ?? null,
                validReturnedLabs: validResult.labs,
                validReturnedLabCount: validResult.metadata.labCount ?? null,
                writeCount: writes.length,
                advertisedReturnedHasLabs: Object.prototype.hasOwnProperty.call(
                  advertisedResult,
                  'labs'
                ),
                advertisedStorage: advertisedResult.storage,
                absentStorage: absentResult.storage,
                mismatchedStorage: mismatchedResult.storage
              }));
            })().catch((error) => {
              console.error(error);
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-storage.js",
        )

        self.assertFalse(payload["invalidHasLabs"])
        self.assertFalse(payload["invalidReturnedHasLabs"])
        self.assertEqual([{"id": "lab-1"}], payload["validLabs"])
        self.assertEqual(1, payload["validMetadataLabCount"])
        self.assertEqual([{"id": "lab-1"}], payload["validReturnedLabs"])
        self.assertEqual(1, payload["validReturnedLabCount"])
        self.assertEqual(2, payload["writeCount"])
        self.assertTrue(payload["advertisedReturnedHasLabs"])
        self.assertEqual("localStorage", payload["advertisedStorage"])
        self.assertEqual("localStorage", payload["absentStorage"])
        self.assertEqual("localStorage", payload["mismatchedStorage"])

    def test_corrupt_labs_mirror_degrades_to_no_labs_in_both_loaders(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const values = new Map([
              ['custom_alpha_questions', JSON.stringify([{ id: 1 }])],
              ['custom_alpha_labs', '{invalid json']
            ]);
            global.window = {
              location: {
                search: '?exam=custom&code=alpha',
                href: 'https://examplar.app/exam.html?exam=custom&code=alpha'
              },
              userExams: {},
              ExamApp: {
                isSafeExamId() { return true; },
                validateExamData(questions, metadata, labs) {
                  return {
                    valid: Array.isArray(questions)
                      && (labs === undefined || Array.isArray(labs))
                  };
                },
                isBundledTrustedExam() { return false; },
                warn() {},
                log() {}
              },
              addEventListener() {},
              matchMedia() { return { matches: false }; }
            };
            global.document = {
              addEventListener() {},
              getElementById() { return null; },
              querySelectorAll() { return []; },
              createElement() { return { appendChild() {}, classList: { add() {} } }; },
              createTextNode(value) { return { textContent: String(value) }; },
              body: {
                dataset: {},
                classList: { add() {}, contains() { return false; }, toggle() {} },
                appendChild() {}
              }
            };
            global.localStorage = {
              getItem(key) { return values.has(key) ? values.get(key) : null; },
              setItem() {},
              removeItem() {},
              key() { return null; },
              length: 0
            };
            global.fetch = async () => ({ ok: false });
            global.alert = () => {};
            const source = fs.readFileSync(process.argv[1], 'utf8');
            vm.runInThisContext(
              source + '\n;globalThis.RuntimeSimulator = MultiExamSimulator;',
              { filename: process.argv[1] }
            );
            (async () => {
              const runtime = Object.create(globalThis.RuntimeSimulator.prototype);
              runtime.examData = {};
              const runtimeLoaded = runtime.loadExamFromRuntime('alpha');
              const custom = Object.create(globalThis.RuntimeSimulator.prototype);
              custom.examData = {};
              const customLoaded = await custom.loadCustomExamIfRequested();
              console.log(JSON.stringify({
                runtimeLoaded,
                runtimeLabs: runtime.examData.alpha?.labs,
                customLoaded
              }));
            })().catch((error) => {
              console.error(error);
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "script-multi-exam.js",
        )

        self.assertTrue(payload["runtimeLoaded"])
        self.assertEqual([], payload["runtimeLabs"])
        self.assertTrue(payload["customLoaded"])

    def test_exam_manager_requires_the_canonical_metadata_sanitizer(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              userExams: {},
              ExamApp: {
                warn() {},
                sanitizeExamMetadata(metadata, options) {
                  return { metadata, options, canonical: true };
                }
              }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {}
            };
            vm.runInThisContext(
              fs.readFileSync(process.argv[1], 'utf8'),
              { filename: process.argv[1] }
            );
            const canonical = window.examManager.sanitizeMetadata(
              { name: 'Alpha' },
              true
            );
            delete window.ExamApp.sanitizeExamMetadata;
            let missingDependencyThrows = false;
            try {
              window.examManager.sanitizeMetadata({ source: 'forged' }, false);
            } catch (_) {
              missingDependencyThrows = true;
            }
            console.log(JSON.stringify({
              canonical: canonical.canonical,
              allowCommercial: canonical.options.allowCommercial,
              missingDependencyThrows
            }));
            """,
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        self.assertTrue(payload["canonical"])
        self.assertTrue(payload["allowCommercial"])
        self.assertTrue(payload["missingDependencyThrows"])

    def test_zip_declared_sizes_do_not_use_jszip_private_state(self):
        worker = (ROOT / "assets/js/zip-import-worker.js").read_text(
            encoding="utf-8"
        )

        self.assertNotIn("entry?._data", worker)
        self.assertNotIn("entry._data", worker)
        self.assertIn("declaredSizes", worker)
        self.assertIn("preflightRawArchive(archiveBuffer, limits)", worker)


if __name__ == "__main__":
    unittest.main()
