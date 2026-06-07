"""Security and data-integrity regression tests for audit Phase 0."""

import json
import subprocess
import tempfile
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
        timeout=15,
    )


def utils_bootstrap(assertions: str) -> str:
    return textwrap.dedent(
        f"""
        const fs = require('fs');
        const vm = require('vm');
        global.window = {{
          location: {{ hostname: 'localhost', search: '', href: 'http://localhost/' }}
        }};
        global.document = {{
          createElement() {{ return {{ appendChild() {{}}, innerHTML: '' }}; }},
          createTextNode(value) {{ return {{ value }}; }}
        }};
        global.localStorage = {{
          getItem() {{ return null; }},
          setItem() {{}},
          removeItem() {{}}
        }};
        vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
        {assertions}
        """
    )


class ZipBoundaryTests(unittest.TestCase):
    def test_zip_inspection_rejects_oversized_dump_before_extraction(self):
        script = utils_bootstrap(
            """
            const limits = window.ExamApp.EXAM_LIMITS;
            const zip = {
              forEach(callback) {
                callback('pack/dump.json', {
                  dir: false,
                  name: 'pack/dump.json',
                  _data: { uncompressedSize: limits.maxJsonBytes + 1 }
                });
              }
            };
            try {
              window.ExamApp.inspectZipEntries(zip);
              process.exitCode = 2;
            } catch (error) {
              if (!/dump\\.json is too large/i.test(error.message)) throw error;
              console.log('rejected oversized dump');
            }
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("rejected oversized dump", result.stdout)

    def test_zip_inspection_rejects_excessive_entry_count(self):
        script = utils_bootstrap(
            """
            const limits = window.ExamApp.EXAM_LIMITS;
            const zip = {
              forEach(callback) {
                for (let i = 0; i <= limits.maxZipEntries; i++) {
                  callback(`pack/file-${i}.txt`, {
                    dir: false,
                    name: `pack/file-${i}.txt`,
                    _data: { uncompressedSize: 1 }
                  });
                }
              }
            };
            try {
              window.ExamApp.inspectZipEntries(zip);
              process.exitCode = 2;
            } catch (error) {
              if (!/too many entries/i.test(error.message)) throw error;
              console.log('rejected entry count');
            }
            """
        )
        result = run_node(script)
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("rejected entry count", result.stdout)


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


class EncryptedEnvelopeTests(unittest.TestCase):
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

    def test_live_pro_pack_review_statuses_match_documented_evidence(self):
        az104 = json.loads(
            (ROOT / "user-content" / "exams" / "az104" / "metadata.json").read_text(encoding="utf-8")
        )
        saac03 = json.loads(
            (ROOT / "user-content" / "exams" / "saac03" / "metadata.json").read_text(encoding="utf-8")
        )
        self.assertEqual(az104["pro"]["reviewStatus"], "released-sme-review-pending")
        self.assertEqual(saac03["pro"]["reviewStatus"], "released-reviewed")


if __name__ == "__main__":
    unittest.main()
