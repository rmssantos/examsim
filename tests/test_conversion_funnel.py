import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ConversionFunnelTests(unittest.TestCase):

    def test_runtime_keeps_resolved_session_type_in_local_progress(self):
        source = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        attempt = source[source.index("    saveProgress("):source.index("    updateProgressDisplay()")]
        self.assertIn("    getSessionType()", source)
        self.assertIn("sessionType: this.getSessionType()", attempt)

    def test_diagnostic_attempt_is_saved_without_changing_completion_aggregates(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const utilsSource = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('class MultiExamSimulator');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'");
const classSource = source.slice(start, end);
const records = new Map([
  ['sc900_progress', JSON.stringify({
    attempts: [{ score: 80 }],
    bestScore: 80,
    totalPassed: 1
  })]
]);
const context = {
  URL,
  URLSearchParams,
  console,
  alert() {},
  CustomEvent: class CustomEvent {
    constructor(type) { this.type = type; }
  },
  localStorage: {
    getItem(key) { return records.get(key) ?? null; },
    setItem(key, value) { records.set(key, value); }
  },
  document: {
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { appendChild() {}, innerHTML: '' }; },
    createTextNode(value) { return { value }; }
  },
  window: {
    dispatchEvent() {},
    location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
  }
};
vm.createContext(context);
vm.runInContext(utilsSource, context, { filename: 'utils.js' });
Object.assign(context.window.ExamApp, {
  STORAGE_KEYS: { progress: 'progress' },
  addToRegistry() {}
});
vm.runInContext(
  classSource + '\n;globalThis.MultiExamSimulator = MultiExamSimulator;',
  context,
  { filename: 'script-multi-exam.js' }
);

const Simulator = context.MultiExamSimulator;
const sim = Object.create(Simulator.prototype);
Object.assign(sim, {
  currentExam: 'sc900',
  examData: {
    sc900: {
      sessionType: 'diagnostic',
      selectedModules: null
    }
  },
  mode: 'exam',
  getCurrentQuestions() { return [{ id: 'q1' }]; },
  buildAttemptQuestionResults() {
    return [{
      questionId: 'q1',
      order: 1,
      userAnswer: 0,
      correct: true,
      skipped: false
    }];
  },
  generateLocalId() { return 'attempt_test'; },
  saveProgressToStorage(key, progress) {
    context.localStorage.setItem(key, JSON.stringify(progress));
    return true;
  }
});

const snapshot = () => JSON.parse(context.localStorage.getItem('sc900_progress'));

sim.saveProgress(100, true, 1);
const diagnostic = snapshot();

sim.examData.sc900.sessionType = 'full';
sim.saveProgress(80, true, 2);
const full = snapshot();

sim.mode = 'study';
sim.saveProgress(90, true, 3);
const study = snapshot();

console.log(JSON.stringify({ diagnostic, full, study }));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/script-multi-exam.js"),
                str(ROOT / "assets/js/utils.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(len(payload["diagnostic"]["attempts"]), 2)
        self.assertEqual(payload["diagnostic"]["attempts"][-1]["sessionType"], "diagnostic")
        self.assertNotIn("passed", payload["diagnostic"]["attempts"][0])
        self.assertEqual(payload["diagnostic"]["bestScore"], 80)
        self.assertEqual(payload["diagnostic"]["totalPassed"], 1)
        self.assertEqual(len(payload["full"]["attempts"]), 3)
        self.assertEqual(payload["full"]["bestScore"], 80)
        self.assertEqual(payload["full"]["totalPassed"], 2)
        self.assertEqual(len(payload["study"]["attempts"]), 4)
        self.assertEqual(payload["study"]["bestScore"], 90)
        self.assertEqual(payload["study"]["totalPassed"], 3)

    def test_diagnostic_only_readiness_copy_is_explicit(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('class HomePage');
const end = source.indexOf('// Initialize when page loads');
const classSource = source.slice(start, end);
const context = {};
vm.runInNewContext(
  classSource + '\n;globalThis.HomePage = HomePage;',
  context,
  { filename: 'homepage.js' }
);
const home = Object.create(context.HomePage.prototype);
console.log(JSON.stringify({
  diagnosticHigh: home.getReadinessLabel({
    attempts: 1,
    completionAttempts: 0,
    lastScore: 80,
    bestScore: null,
    passRate: null
  }),
  diagnosticLow: home.getReadinessLabel({
    attempts: 1,
    completionAttempts: 0,
    lastScore: 40,
    bestScore: null,
    passRate: null
  }),
  mixedHigh: home.getReadinessLabel({
    attempts: 2,
    completionAttempts: 1,
    lastScore: 80,
    bestScore: 80,
    passRate: 100
  }),
  mixedLow: home.getReadinessLabel({
    attempts: 2,
    completionAttempts: 1,
    lastScore: 40,
    bestScore: 80,
    passRate: 100
  })
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/homepage.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "diagnosticHigh": "Diagnostic suggests on track",
                "diagnosticLow": "Diagnostic suggests review",
                "mixedHigh": "On track",
                "mixedLow": "Needs work",
            },
        )

    def test_readiness_uses_last_completion_instead_of_later_diagnostic(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const utilsSource = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('class HomePage');
const end = source.indexOf('// Initialize when page loads');
const classSource = source.slice(start, end);
const progressByKey = new Map([
  ['full_then_diagnostic_progress', JSON.stringify({
    attempts: [
      { score: 90, passed: true, date: '2026-07-28T10:00:00Z', sessionType: 'full' },
      { score: 10, date: '2026-07-29T10:00:00Z', sessionType: 'diagnostic' }
    ]
  })],
  ['diagnostic_then_full_progress', JSON.stringify({
    attempts: [
      { score: 100, date: '2026-07-28T10:00:00Z', sessionType: 'diagnostic' },
      { score: 20, passed: false, date: '2026-07-29T10:00:00Z', sessionType: 'full' }
    ]
  })],
  ['diagnostic_only_progress', JSON.stringify({
    attempts: [
      { score: 80, date: '2026-07-29T10:00:00Z', sessionType: 'diagnostic' }
    ]
  })]
]);
const context = {
  URL,
  URLSearchParams,
  console,
  localStorage: {
    getItem(key) { return progressByKey.get(key) || null; }
  },
  document: {
    createElement() { return { appendChild() {}, innerHTML: '' }; },
    createTextNode(value) { return { value }; }
  },
  window: {
    location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
  }
};
vm.createContext(context);
vm.runInContext(utilsSource, context, { filename: 'utils.js' });
vm.runInContext(
  classSource + '\n;globalThis.HomePage = HomePage;',
  context,
  { filename: 'homepage.js' }
);
const home = Object.create(context.HomePage.prototype);
const collect = examId => {
  const stats = home.getProgressStats(examId);
  return {
    completionAttempts: stats.completionAttempts,
    lastScore: stats.lastScore,
    lastCompletionScore: stats.lastCompletionScore,
    lastDiagnosticScore: stats.lastDiagnosticScore,
    readiness: home.getReadinessLabel(stats)
  };
};
console.log(JSON.stringify({
  fullThenDiagnostic: collect('full_then_diagnostic'),
  diagnosticThenFull: collect('diagnostic_then_full'),
  diagnosticOnly: collect('diagnostic_only')
}));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/homepage.js"),
                str(ROOT / "assets/js/utils.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "fullThenDiagnostic": {
                    "completionAttempts": 1,
                    "lastScore": 10,
                    "lastCompletionScore": 90,
                    "lastDiagnosticScore": 10,
                    "readiness": "On track",
                },
                "diagnosticThenFull": {
                    "completionAttempts": 1,
                    "lastScore": 20,
                    "lastCompletionScore": 20,
                    "lastDiagnosticScore": 100,
                    "readiness": "Needs work",
                },
                "diagnosticOnly": {
                    "completionAttempts": 0,
                    "lastScore": 80,
                    "lastCompletionScore": None,
                    "lastDiagnosticScore": 80,
                    "readiness": "Diagnostic suggests on track",
                },
            },
        )

    def test_zip_import_in_file_mode_requires_the_supported_local_server(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const helperStart = source.indexOf('window.ExamApp.extractZipArchiveInWorker =');
const helperEnd = source.indexOf('class HomePage');
const helperSource = source.slice(helperStart, helperEnd);
let fileRead = false;
let workerConstructed = false;
const context = {
  URL,
  document: { baseURI: 'file:///tmp/examplar/index.html' },
  window: {
    location: { protocol: 'file:' },
    ExamApp: {
      EXAM_LIMITS: {
        maxZipBytes: 50 * 1024 * 1024,
        maxZipEntries: 512,
        maxZipUncompressedBytes: 120 * 1024 * 1024,
        maxJsonBytes: 5 * 1024 * 1024,
        maxImages: 250,
        maxImageBytes: 10 * 1024 * 1024,
        maxTotalImageBytes: 100 * 1024 * 1024,
        zipWorkerTimeoutMs: 30000
      }
    }
  },
  Worker: class {
    constructor() {
      workerConstructed = true;
      throw new Error('worker should not be constructed for file mode');
    }
  }
};
vm.runInNewContext(helperSource, context, { filename: 'homepage.js' });
(async () => {
  let caught = null;
  try {
    await context.window.ExamApp.extractZipArchiveInWorker({
      name: 'demo.zip',
      size: 128,
      async arrayBuffer() {
        fileRead = true;
        return new ArrayBuffer(128);
      }
    });
  } catch (error) {
    caught = { code: error.code || null, message: error.message };
  }
  console.log(JSON.stringify({ caught, fileRead, workerConstructed }));
})().catch(error => { console.error(error); process.exitCode = 1; });
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/homepage.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual("ZIP_SERVER_REQUIRED", payload["caught"]["code"])
        self.assertIn("python server.py", payload["caught"]["message"])
        self.assertFalse(payload["fileRead"])
        self.assertFalse(payload["workerConstructed"])

    def test_results_screen_wires_trusted_pro_upsell_and_pass_story(self):
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        init = (ROOT / "assets/js/exam-init.js").read_text(encoding="utf-8")

        # exam-init must hand a bundled pack's own pro offer to the runtime while
        # keeping imported metadata from activating a purchase path.
        self.assertIn(
            "pro: isBundledTrusted ? (metadata.pro || null) : null",
            init,
        )

        # The results slot renders the pack's own upsell ahead of the cross-sell,
        # and the pass-story invite links to the public discussion.
        self.assertIn("renderProUpsell", runtime)
        self.assertIn("github.com/rmssantos/examsim/discussions/77", runtime)


    def test_github_star_path_appears_after_exam_value_not_in_study_results(self):
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")

        self.assertIn("https://github.com/rmssantos/examsim", runtime)
        self.assertIn("Found this useful?", runtime)
        self.assertIn("Star Examplar on GitHub", runtime)
        self.assertIn('rel="noopener noreferrer"', runtime)

        study_start = runtime.index("    showStudyResults(")
        study_results = runtime[
            study_start : runtime.index("    showResults(", study_start)
        ]
        self.assertIn("results-recommended-pro", study_results)
        self.assertIn("innerHTML = ''", study_results)


    def test_secondary_purchase_surfaces_render_launch_offer(self):
        roadmaps = (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8")
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        exam_css = (ROOT / "assets/css/exam-v2.css").read_text(encoding="utf-8")
        landing_css = (ROOT / "assets/css/exam-landing.css").read_text(encoding="utf-8")

        self.assertIn("window.ExamApp.getPromotionOffer", roadmaps)
        self.assertIn("pro-modal-offer", roadmaps)
        self.assertIn("window.ExamApp.getPromotionOffer", runtime)
        self.assertIn("results-pro-offer", runtime)
        self.assertIn("Limited launch offer", runtime)
        self.assertIn(".results-pro-offer", exam_css)
        self.assertIn(".pro-offer", landing_css)

    def test_dynamic_purchase_offers_label_prices_plus_taxes(self):
        expected_surfaces = {
            ROOT / "assets/js/homepage.js": 4,
            ROOT / "assets/js/roadmaps.js": 2,
            ROOT / "assets/js/script-multi-exam.js": 4,
        }

        for path, expected_count in expected_surfaces.items():
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertEqual(
                    source.count(" + taxes"),
                    expected_count,
                )

        homepage = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        roadmaps = (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8")
        results = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        self.assertEqual(homepage.count("${promotion.offerPrice} + taxes"), 2)
        self.assertIn("escapeHtml(promotion.offerPrice) + ' + taxes'", roadmaps)
        self.assertEqual(
            results.count("${this.escapeHtml(promotion.offerPrice)} + taxes"),
            2,
        )

if __name__ == "__main__":
    unittest.main()
