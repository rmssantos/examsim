"""Regression tests for advertising and filtering hands-on labs."""

import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _run_node(script: str) -> dict:
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node not available")
    result = subprocess.run(
        [node, "-e", script, str(ROOT / "assets" / "js" / "homepage.js")],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=20,
    )
    if result.returncode != 0:
        raise AssertionError(result.stdout)
    return json.loads(result.stdout)


class LabDiscoveryTests(unittest.TestCase):
    def test_availability_uses_loaded_labs_and_paid_total(self):
        payload = _run_node(
            textwrap.dedent(
                r"""
                const fs = require('fs');
                const vm = require('vm');
                global.window = {
                  location: { hostname: 'localhost', search: '', href: 'http://localhost/', protocol: 'http:' },
                  ExamApp: {
                    isBundledTrustedExam(exam) { return exam?.trust === 'bundled'; },
                    EXAM_LIMITS: {}
                  }
                };
                global.document = {
                  baseURI: 'http://localhost/',
                  createElement() { return { appendChild() {}, textContent: '', value: '' }; },
                  createTextNode(value) { return { value }; },
                  getElementById() { return null; },
                  querySelector() { return null; },
                  querySelectorAll() { return []; },
                  addEventListener() {}
                };
                global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
                vm.runInThisContext(`${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`);
                const pageUnderTest = Object.create(window.HomePageForTest.prototype);
                const paidPreview = {
                  trust: 'bundled', source: 'bundled',
                  labs: [{ id: 'free-lab' }],
                  metadata: { labCount: 1, pro: { labCount: 8 } }
                };
                const metadataFirstPreview = {
                  trust: 'bundled', source: 'bundled',
                  loaded: false, labs: [],
                  metadata: { labCount: 1, pro: { labCount: 8 } }
                };
                const staleMetadata = {
                  trust: 'bundled', source: 'bundled',
                  labs: [],
                  metadata: { labCount: 4 }
                };
                const paidOnly = {
                  trust: 'bundled', source: 'bundled',
                  labs: [],
                  metadata: { pro: { labCount: 6 } }
                };
                console.log(JSON.stringify({
                  paidPreview: pageUnderTest.getLabAvailability(paidPreview),
                  metadataFirstPreview: pageUnderTest.getLabAvailability(metadataFirstPreview),
                  staleMetadata: pageUnderTest.getLabAvailability(staleMetadata),
                  paidOnly: pageUnderTest.getLabAvailability(paidOnly),
                  paidSnapshot: pageUnderTest.getExamMetadataSnapshot(paidPreview).pro
                }));
                """
            )
        )

        self.assertEqual(
            payload["paidPreview"],
            {"accessible": 1, "total": 8, "locked": 7, "hasLabs": True},
        )
        self.assertEqual(
            payload["metadataFirstPreview"],
            {"accessible": 1, "total": 8, "locked": 7, "hasLabs": True},
        )
        self.assertEqual(
            payload["staleMetadata"],
            {"accessible": 0, "total": 0, "locked": 0, "hasLabs": False},
        )
        self.assertEqual(
            payload["paidOnly"],
            {"accessible": 0, "total": 6, "locked": 6, "hasLabs": True},
        )
        self.assertEqual(payload["paidSnapshot"]["labCount"], 8)

    def test_hands_on_labs_filter_includes_free_and_paid_labs_only(self):
        payload = _run_node(
            textwrap.dedent(
                r"""
                const fs = require('fs');
                const vm = require('vm');
                global.window = {
                  location: { hostname: 'localhost', search: '', href: 'http://localhost/', protocol: 'http:' },
                  ExamApp: {
                    isBundledTrustedExam(exam) { return exam?.trust === 'bundled'; },
                    EXAM_LIMITS: {}
                  }
                };
                global.document = {
                  baseURI: 'http://localhost/',
                  createElement() { return { appendChild() {}, textContent: '', value: '' }; },
                  createTextNode(value) { return { value }; },
                  getElementById() { return null; },
                  querySelector() { return null; },
                  querySelectorAll() { return []; },
                  addEventListener() {}
                };
                global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
                vm.runInThisContext(`${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`);
                const pageUnderTest = Object.create(window.HomePageForTest.prototype);
                pageUnderTest.availableExams = new Map([
                  ['free-labs', { trust: 'bundled', source: 'bundled', labs: [{ id: 'l1' }], metadata: { name: 'Free labs' } }],
                  ['paid-labs', { trust: 'bundled', source: 'bundled', labs: [], metadata: { name: 'Paid labs', pro: { labCount: 8 } } }],
                  ['no-labs', { trust: 'bundled', source: 'bundled', labs: [], metadata: { name: 'No labs' } }]
                ]);
                pageUnderTest.libraryState = {
                  query: '', vendor: '', domain: '', level: '', status: '', labs: 'available', sort: 'recommended'
                };
                console.log(JSON.stringify({ ids: Array.from(pageUnderTest.getFilteredSortedExams().keys()) }));
                """
            )
        )

        self.assertEqual(payload["ids"], ["free-labs", "paid-labs"])

    def test_details_action_hides_without_labs_and_routes_locked_labs_to_unlock(self):
        payload = _run_node(
            textwrap.dedent(
                r"""
                const fs = require('fs');
                const vm = require('vm');
                global.window = {
                  location: { hostname: 'localhost', search: '', href: 'http://localhost/', protocol: 'http:' },
                  ExamApp: {
                    isBundledTrustedExam(exam) { return exam?.trust === 'bundled'; },
                    EXAM_LIMITS: {}
                  }
                };
                global.document = {
                  baseURI: 'http://localhost/',
                  createElement() { return { appendChild() {}, textContent: '', value: '' }; },
                  createTextNode(value) { return { value }; },
                  getElementById() { return null; },
                  querySelector() { return null; },
                  querySelectorAll() { return []; },
                  addEventListener() {}
                };
                global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
                vm.runInThisContext(`${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`);
                const pageUnderTest = Object.create(window.HomePageForTest.prototype);
                let unlocks = 0;
                pageUnderTest.showProModal = () => { unlocks += 1; };
                function control() {
                  const classes = new Set(['is-hidden']);
                  const label = { textContent: '' };
                  return {
                    href: '', onclick: null,
                    classList: {
                      add(value) { classes.add(value); },
                      remove(value) { classes.delete(value); },
                      contains(value) { return classes.has(value); }
                    },
                    setAttribute(name, value) { this[name] = value; },
                    removeAttribute(name) { delete this[name]; },
                    querySelector() { return label; },
                    label
                  };
                }
                const absent = control();
                pageUnderTest.configureDetailsLabsAction(absent, 'none', {
                  trust: 'bundled', source: 'bundled', labs: [], metadata: {}
                });
                const paid = control();
                pageUnderTest.configureDetailsLabsAction(paid, 'paid', {
                  trust: 'bundled', source: 'bundled', labs: [], metadata: { pro: { labCount: 8 } }
                });
                paid.onclick({ preventDefault() {} });
                const preview = control();
                pageUnderTest.configureDetailsLabsAction(preview, 'preview', {
                  trust: 'bundled', source: 'bundled', labs: [{ id: 'free' }], metadata: { pro: { labCount: 8 } }
                });
                console.log(JSON.stringify({
                  absentHidden: absent.classList.contains('is-hidden'),
                  absentHref: absent.href || null,
                  paidHidden: paid.classList.contains('is-hidden'),
                  paidLabel: paid.label.textContent,
                  paidUnlocks: unlocks,
                  previewHref: preview.href,
                  previewLabel: preview.label.textContent
                }));
                """
            )
        )

        self.assertTrue(payload["absentHidden"])
        self.assertIsNone(payload["absentHref"])
        self.assertFalse(payload["paidHidden"])
        self.assertEqual(payload["paidLabel"], "Hands-on labs (8 in Complete)")
        self.assertEqual(payload["paidUnlocks"], 1)
        self.assertEqual(payload["previewHref"], "labs.html?exam=preview")
        self.assertEqual(payload["previewLabel"], "Hands-on labs (1 free / 8 Complete)")


if __name__ == "__main__":
    unittest.main()
