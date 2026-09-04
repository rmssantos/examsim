import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AI103DiagnosticTests(unittest.TestCase):
    def test_ten_question_diagnostic_covers_all_blueprint_domains(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const metadata = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const questions = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const start = source.indexOf('class MultiExamSimulator');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'");
const context = { URL, URLSearchParams, console, document: {}, window: { ExamApp: {} } };
vm.runInNewContext(
  source.slice(start, end) + '\n;globalThis.MultiExamSimulator = MultiExamSimulator;',
  context,
  { filename: 'script-multi-exam.js' }
);
const simulator = Object.create(context.MultiExamSimulator.prototype);
simulator.shuffle = (items) => items;
const sampled = simulator.sampleBalancedQuestions(
  questions,
  10,
  metadata.objectiveDomains
);
const moduleToDomain = new Map();
for (const domain of metadata.objectiveDomains) {
  for (const moduleName of domain.mappedModules) {
    moduleToDomain.set(moduleName, domain.code);
  }
}
const counts = Object.fromEntries(metadata.objectiveDomains.map((domain) => [domain.code, 0]));
for (const question of sampled) {
  const domain = moduleToDomain.get(question.module);
  if (domain) counts[domain] += 1;
}
console.log(JSON.stringify({ length: sampled.length, counts }));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/script-multi-exam.js"),
                str(ROOT / "user-content/exams/ai103/metadata.json"),
                str(ROOT / "user-content/exams/ai103/dump.json"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)

        self.assertEqual(payload["length"], 10)
        self.assertEqual(
            payload["counts"],
            {
                "AI103-1": 3,
                "AI103-2": 4,
                "AI103-3": 1,
                "AI103-4": 1,
                "AI103-5": 1,
            },
        )

    def test_weighted_sampler_backfills_capacity_without_duplicates(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('class MultiExamSimulator');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'");
const context = { URL, URLSearchParams, console, document: {}, window: { ExamApp: {} } };
vm.runInNewContext(
  source.slice(start, end) + '\n;globalThis.MultiExamSimulator = MultiExamSimulator;',
  context
);
const simulator = Object.create(context.MultiExamSimulator.prototype);
simulator.shuffle = (items) => items;
const questions = [
  { id: 'd1-only', module: 'D1 module' },
  { id: 'd2-only', module: 'D2 module' },
  { id: 'extra-1', module: 'Unmapped' },
  { id: 'extra-2', module: 'Unmapped' },
  { id: 'extra-3', module: 'Unmapped' }
];
const domains = [
  { weightRange: '90-95%', mappedModules: ['D1 module'] },
  { weightRange: '5-10%', mappedModules: ['D2 module'] }
];
const sampled = simulator.sampleBalancedQuestions(questions, 4, domains);
console.log(JSON.stringify(sampled.map((question) => question.id)));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/script-multi-exam.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        ids = json.loads(result.stdout)

        self.assertEqual(len(ids), 4)
        self.assertEqual(len(set(ids)), 4)
        self.assertIn("d1-only", ids)
        self.assertIn("d2-only", ids)

    def test_only_trusted_bundled_metadata_reaches_domain_sampler(self):
        init_source = (ROOT / "assets/js/exam-init.js").read_text(encoding="utf-8")
        simulator_source = (ROOT / "assets/js/script-multi-exam.js").read_text(
            encoding="utf-8"
        )

        self.assertIn(
            "objectiveDomains: isBundledTrusted ? (metadata.objectiveDomains || []) : []",
            init_source,
        )
        self.assertIn(
            "this.sampleBalancedQuestions(full, targetCount, exam.objectiveDomains)",
            simulator_source,
        )


if __name__ == "__main__":
    unittest.main()
