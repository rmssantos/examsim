import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AnalyticsProvenanceTests(unittest.TestCase):
    def test_exam_source_prefers_runtime_provenance_over_public_id(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);

global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = () => Promise.resolve();
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href: 'https://examplar.app/',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/'
  },
  userExams: {
    sc900: { source: 'bundled', trust: 'bundled' },
    az104: { source: 'imported', trust: 'local-unverified' },
    dp900: { source: 'bundled', trust: 'local-unverified' }
  },
  // A stale simulator record must not override the canonical runtime registry.
  examSimulator: {
    examData: {
      az104: { source: 'bundled', trust: 'bundled' }
    }
  },
  ExamApp: {
    isPublicSiteHost(host = 'examplar.app') {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const properties = window.ExamApp.analytics._private.getExamProperties;
console.log(JSON.stringify({
  bundled: properties('sc900'),
  importedCollision: properties('az104'),
  malformedPublicPack: properties('dp900'),
  legacyUnregisteredImport: properties('not-in-the-runtime')
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)

        self.assertEqual(
            payload["bundled"],
            {"exam_id": "sc900", "exam_source": "bundled"},
        )
        self.assertEqual(
            payload["importedCollision"],
            {"exam_id": "imported", "exam_source": "imported"},
        )
        self.assertEqual(
            payload["malformedPublicPack"],
            {"exam_id": "unknown", "exam_source": "unknown"},
        )
        self.assertEqual(
            payload["legacyUnregisteredImport"],
            {"exam_id": "imported", "exam_source": "imported"},
        )

    def test_runtime_never_overlays_legacy_questions_on_bundled_trust(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('loadQuestions() {');
const end = source.indexOf('\n    bindEvents()', start);
if (start < 0 || end < 0) throw new Error('loadQuestions method not found');
const methodSource = source.slice(start, end);
const context = {
  window: {
    userExams: {
      sc900: {
        questions: [{ id: 'bundled' }],
        metadata: { name: 'SC-900' },
        source: 'bundled',
        trust: 'bundled',
        storage: 'network'
      }
    },
    ExamApp: {
      isSafeExamId() { return true; },
      validateExamData() { return { valid: true }; },
      log() {},
      warn() {}
    }
  },
  localStorage: {
    getItem(key) {
      if (key === 'custom_sc900_questions') {
        return JSON.stringify([{ id: 'unverified-local-override' }]);
      }
      return null;
    }
  }
};
const holder = vm.runInNewContext(`({${methodSource}})`, context);
const simulator = {
  examData: {},
  loadExamFromRuntime(examId) {
    const runtime = context.window.userExams[examId];
    this.examData[examId] = {
      questions: runtime.questions,
      source: runtime.source,
      trust: runtime.trust
    };
  }
};
holder.loadQuestions.call(simulator);
console.log(JSON.stringify(simulator.examData.sc900));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/script-multi-exam.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)

        self.assertEqual([{"id": "bundled"}], payload["questions"])
        self.assertEqual("bundled", payload["source"])
        self.assertEqual("bundled", payload["trust"])


if __name__ == "__main__":
    unittest.main()
