"""Security and data-integrity regression tests for audit Phase 0."""

import json
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

try:
    from .node_harness import utils_bootstrap
except ImportError:
    from node_harness import utils_bootstrap


ROOT = Path(__file__).resolve().parents[1]


def run_node(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=15,
    )


class ZipBoundaryTests(unittest.TestCase):
    def test_zip_worker_preflights_oversized_json_before_streaming(self):
        worker = (ROOT / "assets" / "js" / "zip-import-worker.js").read_text(
            encoding="utf-8"
        )
        preflight_call = "preflight(entries, limits, declaredSizes)"
        self.assertIn(preflight_call, worker)
        self.assertIn("declared > limits.maxJsonBytes", worker)
        self.assertNotIn("_data?.uncompressedSize", worker)
        self.assertLess(
            worker.index(preflight_call),
            worker.index("await streamEntry("),
        )

    def test_zip_worker_rejects_excessive_entry_count(self):
        worker = (ROOT / "assets" / "js" / "zip-import-worker.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("if (entries.length > limits.maxZipEntries)", worker)
        self.assertIn("throw limitError(`ZIP contains too many entries.", worker)


class RegistryBoundaryTests(unittest.TestCase):
    def test_registry_write_failure_is_best_effort(self):
        script = utils_bootstrap(
            """
            const warnings = [];
            window.ExamApp.warn = (...args) => warnings.push(args.map(String).join(' '));
            global.localStorage = {
              getItem() { return '[]'; },
              setItem() { throw new Error('simulated quota failure'); },
              removeItem() {}
            };
            const values = window.ExamApp.addToRegistry(
              window.ExamApp.STORAGE_KEYS.exams,
              'ai103'
            );
            if (values.length !== 1 || values[0] !== 'ai103') {
              throw new Error('registry normalization changed');
            }
            if (!warnings.some(message => /registry/i.test(message))) {
              throw new Error('registry failure was not reported');
            }
            console.log('registry failure stayed non-fatal');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("registry failure stayed non-fatal", result.stdout)


class ProgressBoundaryTests(unittest.TestCase):
    def test_progress_normalizer_accepts_bounded_legacy_record(self):
        script = utils_bootstrap(
            """
            const normalized = window.ExamApp.normalizeProgressRecord({
              attempts: [{
                attemptId: 'attempt_1',
                date: '2026-06-07T00:00:00.000Z',
                score: 80,
                passed: true,
                timeSpent: 20,
                questionCount: 2,
                questionResults: [
                  { questionId: 'q1', order: 1, userAnswer: 0, correct: true, skipped: false },
                  { questionId: 'q2', order: 2, userAnswer: [0, 2], correct: false, skipped: false }
                ],
                modules: ['Identity']
              }],
              bestScore: 80,
              totalPassed: 1,
              ignored: 'not persisted'
            });
            if (!normalized || normalized.attempts.length !== 1) throw new Error('record rejected');
            if (normalized.ignored !== undefined) throw new Error('unknown field retained');
            if (normalized.attempts[0].questionResults.length !== 2) throw new Error('results missing');
            console.log(JSON.stringify(normalized));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        normalized = json.loads(result.stdout.strip())
        self.assertEqual(normalized["bestScore"], 80)
        self.assertEqual(normalized["totalPassed"], 1)

    def test_progress_normalizer_preserves_legacy_aggregates_without_diagnostics(self):
        script = utils_bootstrap(
            """
            const normalized = window.ExamApp.normalizeProgressRecord({
              attempts: [{ score: 80 }],
              bestScore: 80,
              totalPassed: 1
            });
            console.log(JSON.stringify(normalized));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        normalized = json.loads(result.stdout.strip())
        self.assertEqual(normalized["bestScore"], 80)
        self.assertEqual(normalized["totalPassed"], 1)
        self.assertNotIn("passed", normalized["attempts"][0])

    def test_progress_normalizer_preserves_only_known_session_types(self):
        script = utils_bootstrap(
            """
            for (const sessionType of ['full', 'diagnostic', 'study']) {
              const normalized = window.ExamApp.normalizeProgressRecord({
                attempts: [{ score: 80, sessionType }]
              });
              if (normalized?.attempts?.[0]?.sessionType !== sessionType) {
                throw new Error(`session type not preserved: ${sessionType}`);
              }
            }
            const legacy = window.ExamApp.normalizeProgressRecord({
              attempts: [{ score: 80 }]
            });
            if (!legacy || legacy.attempts[0].sessionType !== undefined) {
              throw new Error('legacy attempt without a session type was rejected');
            }
            for (const sessionType of ['unknown', 'DIAGNOSTIC', 10]) {
              const normalized = window.ExamApp.normalizeProgressRecord({
                attempts: [{ score: 80, sessionType }]
              });
              if (normalized !== null) {
                throw new Error(`invalid session type accepted: ${sessionType}`);
              }
            }
            console.log('validated session types');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("validated session types", result.stdout)

    def test_progress_summary_excludes_diagnostics_from_completion_metrics(self):
        script = utils_bootstrap(
            """
            const summary = window.ExamApp.getProgressSummary({
              attempts: [
                { score: 100, passed: true, sessionType: 'diagnostic' },
                { score: 60, passed: false, sessionType: 'full' },
                { score: 80, passed: true, sessionType: 'study' },
                { score: 75, passed: true }
              ]
            });
            console.log(JSON.stringify(summary));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        summary = json.loads(result.stdout.strip())
        self.assertEqual(
            summary,
            {
                "totalAttempts": 4,
                "completionAttempts": 3,
                "bestScore": 80,
                "totalPassed": 2,
                "passRate": 67,
            },
        )

    def test_progress_summary_preserves_legacy_pass_after_diagnostic(self):
        script = utils_bootstrap(
            """
            const summary = window.ExamApp.getProgressSummary({
              attempts: [
                { score: 80 },
                { score: 100, passed: true, sessionType: 'diagnostic' }
              ],
              bestScore: 80,
              totalPassed: 1
            });
            console.log(JSON.stringify(summary));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertEqual(
            json.loads(result.stdout.strip()),
            {
                "totalAttempts": 2,
                "completionAttempts": 1,
                "bestScore": 80,
                "totalPassed": 1,
                "passRate": 100,
            },
        )

    def test_progress_summary_clamps_malformed_pass_aggregates(self):
        script = utils_bootstrap(
            """
            const tooHigh = window.ExamApp.getProgressSummary({
              attempts: [{ score: 80, passed: true }],
              bestScore: 80,
              totalPassed: 999
            });
            const negative = window.ExamApp.getProgressSummary({
              attempts: [{ score: 20, passed: false }],
              bestScore: 20,
              totalPassed: -4
            });
            console.log(JSON.stringify({ tooHigh, negative }));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        payload = json.loads(result.stdout.strip())
        self.assertEqual(payload["tooHigh"]["totalPassed"], 1)
        self.assertEqual(payload["tooHigh"]["passRate"], 100)
        self.assertEqual(payload["negative"]["totalPassed"], 0)
        self.assertEqual(payload["negative"]["passRate"], 0)

    def test_progress_normalizer_repairs_diagnostic_inflated_legacy_aggregates(self):
        script = utils_bootstrap(
            """
            const normalized = window.ExamApp.normalizeProgressRecord({
              attempts: [
                { score: 100, passed: true, sessionType: 'diagnostic' },
                { score: 65, passed: false }
              ],
              bestScore: 100,
              totalPassed: 1
            });
            console.log(JSON.stringify(normalized));
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        normalized = json.loads(result.stdout.strip())
        self.assertEqual(len(normalized["attempts"]), 2)
        self.assertEqual(normalized["bestScore"], 65)
        self.assertEqual(normalized["totalPassed"], 0)

    def test_progress_normalizer_rejects_oversized_or_invalid_records(self):
        script = utils_bootstrap(
            """
            const limits = window.ExamApp.EXAM_LIMITS;
            const tooMany = {
              attempts: Array.from({ length: limits.maxProgressAttempts + 1 }, (_, i) => ({
                date: '2026-06-07T00:00:00.000Z',
                score: i % 100,
                passed: false,
                timeSpent: 1
              }))
            };
            if (window.ExamApp.normalizeProgressRecord(tooMany) !== null) {
              throw new Error('oversized progress accepted');
            }
            if (window.ExamApp.normalizeProgressRecord({ attempts: [{ score: 'excellent' }] }) !== null) {
              throw new Error('invalid progress accepted');
            }
            console.log('rejected invalid progress');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("rejected invalid progress", result.stdout)

    def test_progress_normalizer_rejects_negative_numeric_answers(self):
        script = utils_bootstrap(
            """
            for (const userAnswer of [-1, [0, -1]]) {
              const progress = {
                attempts: [{
                  score: 50,
                  questionResults: [{
                    questionId: 'q1',
                    order: 1,
                    userAnswer,
                    correct: false,
                    skipped: false
                  }]
                }]
              };
              if (window.ExamApp.normalizeProgressRecord(progress) !== null) {
                throw new Error(`negative answer accepted: ${JSON.stringify(userAnswer)}`);
              }
            }
            console.log('rejected negative answers');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("rejected negative answers", result.stdout)


class EncryptedEnvelopeTests(unittest.TestCase):
    def test_cli_base64_preflight_rejects_oversized_input_before_decode(self):
        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            const source = fs.readFileSync('tools/encrypt-pack.js', 'utf8');
            const start = source.indexOf('function decodeBase64');
            const end = source.indexOf('\\nfunction isEncryptedEnvelope', start);
            if (start < 0 || end < 0) throw new Error('decodeBase64 source not found');

            const context = {
              Buffer: {
                from() {
                  throw new Error('oversized input reached Buffer.from');
                }
              }
            };
            vm.createContext(context);
            vm.runInContext(
              `${source.slice(start, end)}
               result = decodeBase64('A'.repeat(24), null, 4);`,
              context
            );
            if (context.result !== null) throw new Error('oversized input accepted');
            console.log('oversized base64 rejected before decode');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("oversized base64 rejected before decode", result.stdout)

    def test_browser_envelope_validator_rejects_algorithm_and_iteration_changes(self):
        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            const { webcrypto } = require('crypto');
            global.window = { ExamApp: {} };
            global.crypto = webcrypto;
            global.document = { createElement() { throw new Error('not used'); } };
            vm.runInThisContext(fs.readFileSync('assets/js/secure-transfer.js', 'utf8'));
            const secure = window.ExamApp.secureTransfer;
            (async () => {
              const valid = await secure.encrypt({ ok: true }, 'correct-horse-battery');
              if (!secure.isEncryptedEnvelope(valid)) throw new Error('valid envelope rejected');
              for (const changed of [
                { ...valid, version: 2 },
                { ...valid, kdf: 'scrypt' },
                { ...valid, hash: 'SHA-1' },
                { ...valid, cipher: 'AES-CBC' },
                { ...valid, iterations: secure.MAX_KDF_ITERATIONS + 1 },
                { ...valid, salt: 'AA==' },
                { ...valid, iv: 'AA==' }
              ]) {
                if (secure.isEncryptedEnvelope(changed)) throw new Error('invalid envelope accepted');
              }
              console.log('strict envelope validation passed');
            })().catch(error => { console.error(error); process.exitCode = 1; });
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("strict envelope validation passed", result.stdout)

    def test_cli_rejects_unsupported_envelope_before_decryption(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "invalid.json"
            output = Path(tmp) / "output.json"
            source.write_text(
                json.dumps(
                    {
                        "format": "examsim-encrypted",
                        "version": 99,
                        "kdf": "PBKDF2",
                        "hash": "SHA-256",
                        "cipher": "AES-GCM",
                        "iterations": 210000,
                        "salt": "AAAAAAAAAAAAAAAAAAAAAA==",
                        "iv": "AAAAAAAAAAAAAAAA",
                        "data": "AAAA",
                    }
                ),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    "node",
                    "tools/encrypt-pack.js",
                    "decrypt",
                    "--in",
                    str(source),
                    "--key",
                    "correct-horse-battery",
                    "--out",
                    str(output),
                ],
                cwd=ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("valid ExamSim encrypted envelope", result.stdout)


class OptionRandomizationRegressionTests(unittest.TestCase):
    def test_single_and_multi_answers_are_remapped_after_shuffle(self):
        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              ExamApp: {
                normalizeQuestionType(question) {
                  return String(question.question_type || '').toUpperCase();
                }
              },
              addEventListener() {},
              location: { search: '' }
            };
            global.document = {
              body: { dataset: {} },
              addEventListener() {},
              getElementById() { return null; },
              querySelector() { return null; },
              querySelectorAll() { return []; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              length: 0
            };
            global.sessionStorage = { getItem() { return null; }, removeItem() {} };
            const source = fs.readFileSync('assets/js/script-multi-exam.js', 'utf8')
              + '\\nglobalThis.__MultiExamSimulator = MultiExamSimulator;';
            vm.runInThisContext(source);
            const simulator = Object.create(globalThis.__MultiExamSimulator.prototype);
            simulator.shuffle = items => items.reverse();

            const single = simulator.randomizeQuestionOptions({
              question_type: 'STANDARD',
              options: ['correct', 'b', 'c', 'd'],
              correct: 0
            });
            if (single.options[3] !== 'correct' || single.correct !== 3) {
              throw new Error('single answer was not remapped');
            }

            const multi = simulator.randomizeQuestionOptions({
              question_type: 'MULTI',
              options: ['a', 'b', 'c', 'd'],
              correct: [0, 2]
            });
            if (JSON.stringify(multi.correct) !== JSON.stringify([3, 1])) {
              throw new Error(`multi answers were not remapped: ${JSON.stringify(multi.correct)}`);
            }
            console.log('answer remapping passed');
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("answer remapping passed", result.stdout)


class ContentAndReleaseMetadataTests(unittest.TestCase):
    def test_ab731_adoption_questions_have_distinct_stems(self):
        questions = json.loads(
            (ROOT / "user-content" / "exams" / "ab731" / "dump.json").read_text(encoding="utf-8")
        )
        stems = {
            question["id"]: question["question"]
            for question in questions
            if question.get("id") in {47, 115}
        }
        self.assertEqual(set(stems), {47, 115})
        self.assertNotEqual(stems[47], stems[115])

    def test_privacy_document_lists_every_public_analytics_exam(self):
        analytics = (ROOT / "assets" / "js" / "analytics.js").read_text(encoding="utf-8")
        public_ids = analytics.split("publicExamIds: Object.freeze([", 1)[1].split("])", 1)[0]
        public_ids = [value.strip(" '\"\r\n") for value in public_ids.split(",")]
        privacy = (ROOT / "PRIVACY-AND-STORAGE.md").read_text(encoding="utf-8").lower()
        for exam_id in public_ids:
            self.assertIn(f"`{exam_id}`", privacy)

    def test_live_pro_pack_metadata_excludes_internal_review_statuses(self):
        az104 = json.loads(
            (ROOT / "user-content" / "exams" / "az104" / "metadata.json").read_text(encoding="utf-8")
        )
        saac03 = json.loads(
            (ROOT / "user-content" / "exams" / "saac03" / "metadata.json").read_text(encoding="utf-8")
        )
        self.assertNotIn("reviewStatus", az104["pro"])
        self.assertNotIn("reviewStatus", saac03["pro"])


if __name__ == "__main__":
    unittest.main()
