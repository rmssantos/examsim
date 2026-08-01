"""Focused question-id validation and legacy Unicode regressions."""

import importlib.util
import sys
import textwrap
import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet
except ImportError:
    from node_harness import run_node_snippet


ROOT = Path(__file__).resolve().parents[1]

VALIDATOR_SPEC = importlib.util.spec_from_file_location(
    "validate_exam_packs_question_ids",
    ROOT / "tools" / "validate-exam-packs.py",
)
VALIDATOR = importlib.util.module_from_spec(VALIDATOR_SPEC)
sys.modules[VALIDATOR_SPEC.name] = VALIDATOR
VALIDATOR_SPEC.loader.exec_module(VALIDATOR)


class QuestionIdValidationTests(unittest.TestCase):
    def run_node(self, script: str, source: Path):
        return run_node_snippet(source, textwrap.dedent(script), timeout=30)

    @staticmethod
    def cli_issues_for_ids(question_ids):
        validator = VALIDATOR.PackValidator(ROOT)
        validator.validate_questions(
            "test-exam",
            [
                {
                    "id": question_id,
                    "question": f"Question {index}?",
                    "options": ["A", "B"],
                    "correct": 0,
                }
                for index, question_id in enumerate(question_ids, start=1)
            ],
            ROOT / "question-id-test.json",
        )
        return [issue.message for issue in validator.issues]

    @classmethod
    def cli_id_issues(cls, question_id):
        return cls.cli_issues_for_ids([question_id])

    def test_utils_exposes_total_well_formed_string_helper(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            try {
              Object.defineProperty(String.prototype, 'toWellFormed', {
                configurable: true,
                value() { return { forged: true }; },
                writable: true
              });
            } catch (_) {
              String.prototype.toWellFormed = () => ({ forged: true });
            }

            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
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

            const helper = window.ExamApp.toWellFormedString;
            const hostile = { toString() { throw new Error('blocked conversion'); } };
            const malformed = typeof helper === 'function'
              ? helper('left-\uD800-right')
              : '';
            console.log(JSON.stringify({
              helperType: typeof helper,
              malformedCodeUnits: Array.from(malformed, (character) => character.charCodeAt(0)),
              hostile: typeof helper === 'function' ? helper(hostile) : null
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertEqual("function", payload["helperType"])
        self.assertEqual(
            [108, 101, 102, 116, 45, 65533, 45, 114, 105, 103, 104, 116],
            payload["malformedCodeUnits"],
        )
        self.assertEqual("", payload["hostile"])

    def test_runtime_enforces_question_id_length_and_well_formed_unicode(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
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

            function validateId(id) {
              const result = window.ExamApp.validateExamData([{
                id,
                question: 'Question?',
                options: ['A', 'B'],
                correct: 0
              }]);
              return { valid: result.valid, errors: result.errors };
            }

            console.log(JSON.stringify({
              maxQuestionIdLength: window.ExamApp.EXAM_LIMITS.maxQuestionIdLength,
              exact120: validateId('x'.repeat(120)),
              over121: validateId('x'.repeat(121)),
              astralExact120: validateId('\uD83D\uDE00'.repeat(59) + 'xx'),
              astralOver121: validateId('\uD83D\uDE00'.repeat(60) + 'x'),
              loneHigh: validateId('bad-\uD800'),
              loneLow: validateId('bad-\uDC00'),
              malformedLong: validateId('x'.repeat(120) + '\uD800'),
              validEmoji: validateId('emoji-\uD83D\uDE00'),
              numeric: validateId(42)
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertEqual(120, payload.get("maxQuestionIdLength"))
        for name in ("exact120", "astralExact120", "validEmoji", "numeric"):
            with self.subTest(case=name):
                self.assertTrue(payload[name]["valid"], payload[name]["errors"])

        for name in ("over121", "astralOver121"):
            with self.subTest(case=name):
                self.assertFalse(payload[name]["valid"])
                self.assertTrue(
                    any("120" in error and "id" in error.lower() for error in payload[name]["errors"]),
                    payload[name]["errors"],
                )
        for name in ("loneHigh", "loneLow", "malformedLong"):
            with self.subTest(case=name):
                self.assertFalse(payload[name]["valid"])
                self.assertTrue(
                    any("well-formed" in error.lower() for error in payload[name]["errors"]),
                    payload[name]["errors"],
                )

    def test_python_cli_matches_runtime_question_id_rules(self):
        self.assertEqual(120, getattr(VALIDATOR, "MAX_QUESTION_ID_LENGTH", None))

        for name, question_id in {
            "exact120": "x" * 120,
            "astralExact120": ("\U0001F600" * 59) + "xx",
            "validEmoji": "emoji-\U0001F600",
            "numeric": 42,
        }.items():
            with self.subTest(case=name):
                self.assertEqual([], self.cli_id_issues(question_id))

        for name, question_id in {
            "over121": "x" * 121,
            "astralOver121": ("\U0001F600" * 60) + "x",
        }.items():
            with self.subTest(case=name):
                over_issues = self.cli_id_issues(question_id)
                self.assertTrue(
                    any("120" in issue and "id" in issue.lower() for issue in over_issues),
                    over_issues,
                )

        for name, question_id in {
            "loneHigh": "bad-\ud800",
            "loneLow": "bad-\udc00",
            "malformedLong": ("x" * 120) + "\ud800",
        }.items():
            with self.subTest(case=name):
                issues = self.cli_id_issues(question_id)
                self.assertTrue(
                    any("well-formed" in issue.lower() for issue in issues),
                    issues,
                )

    def test_runtime_uses_canonical_question_identity_and_safe_id_types(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
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

            function question(id, index = 1) {
              return {
                id,
                question: `Question ${index}?`,
                options: ['A', 'B'],
                correct: 0
              };
            }
            function validateIds(ids) {
              const result = window.ExamApp.validateExamData(
                ids.map((id, index) => question(id, index + 1))
              );
              return { valid: result.valid, errors: result.errors };
            }
            function canonical(value) {
              return typeof window.ExamApp.canonicalizeQuestionId === 'function'
                ? window.ExamApp.canonicalizeQuestionId(value)
                : null;
            }

            console.log(JSON.stringify({
              canonical: {
                whitespace: canonical('  q\t\n  1  '),
                safeMax: canonical(Number.MAX_SAFE_INTEGER),
                safeMin: canonical(Number.MIN_SAFE_INTEGER),
                negativeZero: canonical(-0)
              },
              valid: {
                safeMax: validateIds([Number.MAX_SAFE_INTEGER]),
                safeMin: validateIds([Number.MIN_SAFE_INTEGER]),
                string: validateIds(['  q\t\n  1  '])
              },
              invalid: {
                booleanTrue: validateIds([true]),
                booleanFalse: validateIds([false]),
                nullValue: validateIds([null]),
                array: validateIds([['q1']]),
                object: validateIds([{ value: 'q1' }]),
                fraction: validateIds([1.5]),
                infinity: validateIds([Infinity]),
                negativeInfinity: validateIds([-Infinity]),
                nan: validateIds([NaN]),
                overSafe: validateIds([Number.MAX_SAFE_INTEGER + 1]),
                underSafe: validateIds([Number.MIN_SAFE_INTEGER - 1])
              },
              duplicates: {
                whitespace: validateIds(['q 1', '  q\t\n  1  ']),
                stringNumber: validateIds(['1', 1]),
                negativeZero: validateIds(['0', -0])
              }
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertEqual(
            {
                "whitespace": "q 1",
                "safeMax": "9007199254740991",
                "safeMin": "-9007199254740991",
                "negativeZero": "0",
            },
            payload["canonical"],
        )
        for name, result in payload["valid"].items():
            with self.subTest(group="valid", case=name):
                self.assertTrue(result["valid"], result["errors"])
        for group_name in ("invalid", "duplicates"):
            for name, result in payload[group_name].items():
                with self.subTest(group=group_name, case=name):
                    self.assertFalse(result["valid"], result["errors"])
                    self.assertTrue(result["errors"])

    def test_cli_uses_canonical_question_identity_and_safe_id_types(self):
        canonicalize = getattr(VALIDATOR, "canonicalize_question_id", lambda _value: None)
        self.assertEqual("q 1", canonicalize("  q\t\n  1  "))
        self.assertEqual("9007199254740991", canonicalize(9007199254740991))
        self.assertEqual("-9007199254740991", canonicalize(-9007199254740991))

        for name, question_id in {
            "safeMax": 9007199254740991,
            "safeMin": -9007199254740991,
            "string": "  q\t\n  1  ",
        }.items():
            with self.subTest(group="valid", case=name):
                self.assertEqual([], self.cli_id_issues(question_id))

        for name, question_id in {
            "booleanTrue": True,
            "booleanFalse": False,
            "nullValue": None,
            "array": ["q1"],
            "object": {"value": "q1"},
            "fraction": 1.5,
            "infinity": float("inf"),
            "negativeInfinity": float("-inf"),
            "nan": float("nan"),
            "overSafe": 9007199254740992,
            "underSafe": -9007199254740992,
        }.items():
            with self.subTest(group="invalid", case=name):
                self.assertTrue(self.cli_id_issues(question_id))

        for name, question_ids in {
            "whitespace": ["q 1", "  q\t\n  1  "],
            "stringNumber": ["1", 1],
            "negativeZero": ["0", 0],
        }.items():
            with self.subTest(group="duplicates", case=name):
                issues = self.cli_issues_for_ids(question_ids)
                self.assertTrue(
                    any("duplicate id" in issue.lower() for issue in issues),
                    issues,
                )

    def test_invalid_question_ids_are_rejected_before_import_writes(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const writes = [];
            global.window = {
              ExamApp: {},
              userExams: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
            };
            window.window = window;
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem(key) { writes.push({ type: 'set', key }); },
              removeItem(key) { writes.push({ type: 'remove', key }); }
            };
            const originalConsole = global.console;
            global.console = { log() {}, warn() {}, error() {} };
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));
            window.ExamApp.examManager.activateExam = (id) => writes.push({ type: 'activate', id });
            window.ExamApp.examManager.detectAvailableExams = async () => {
              writes.push({ type: 'detect' });
            };

            function question(id) {
              return { id, question: 'Question?', options: ['A', 'B'], correct: 0 };
            }

            async function attempt(label, id) {
              const before = writes.length;
              try {
                await window.ExamApp.examManager.importExam(`question-id-${label}`, {
                  questions: [question(id)],
                  metadata: { questionCount: 1 },
                  labs: []
                });
                return { resolved: true, writes: writes.slice(before) };
              } catch (error) {
                return {
                  resolved: false,
                  message: String(error && error.message),
                  writes: writes.slice(before)
                };
              }
            }

            (async () => {
              const results = {
                over121: await attempt('over', 'x'.repeat(121)),
                loneHigh: await attempt('high', 'bad-\uD800'),
                loneLow: await attempt('low', 'bad-\uDC00'),
                malformedLong: await attempt('long', 'x'.repeat(120) + '\uD800')
              };
              global.console = originalConsole;
              process.stdout.write(JSON.stringify({
                results,
                runtimeIds: Object.keys(window.userExams)
              }));
            })().catch((error) => {
              global.console = originalConsole;
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        for name, result in payload["results"].items():
            with self.subTest(case=name):
                self.assertFalse(result["resolved"])
                self.assertEqual([], result["writes"])
                self.assertIn("id", result["message"].lower())
        self.assertEqual([], payload["runtimeIds"])

    def test_browser_stored_long_ids_are_grandfathered_without_relaxing_schema(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const warnings = [];
            global.window = {
              ExamApp: {},
              userExams: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
            };
            window.window = window;
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {}
            };
            global.fetch = async () => ({
              ok: true,
              async json() { return []; },
              async text() { return ''; }
            });
            global.DOMParser = class DOMParser {};
            global.console = { log() {}, warn() {}, error() {} };

            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            window.ExamApp.warn = (...args) => warnings.push(args.map(String).join(' '));

            function question(id, overrides = {}) {
              return {
                id,
                question: 'Question?',
                options: ['A', 'B'],
                correct: 0,
                ...overrides
              };
            }

            const records = {
              'legacy-long': {
                questions: [question('x'.repeat(121))],
                metadata: null,
                labs: [],
                storage: 'indexedDB'
              },
              'legacy-malformed': {
                questions: [question('bad-\uD800')],
                metadata: null,
                labs: [],
                storage: 'indexedDB'
              },
              'legacy-bad-id-type': {
                questions: [question(true)],
                metadata: null,
                labs: [],
                storage: 'localStorage'
              },
              'legacy-unsupported': {
                questions: [question('q1', { question_type: 'HOTSPOT' })],
                metadata: null,
                labs: [],
                storage: 'localStorage'
              }
            };
            const markStored = window.ExamApp.markBrowserStoredExamRecord
              || ((record) => record);
            Object.values(records).forEach(markStored);
            window.ExamApp.examStorage = {
              async listExamIds() { return Object.keys(records); },
              async getExam(examId) { return records[examId]; },
              async listProgressExamIds() { return []; },
              async getProgress() { return null; }
            };

            const strictLong = window.ExamApp.validateExamData(records['legacy-long'].questions);
            const storedLong = typeof window.ExamApp.validateStoredExamData === 'function'
              ? window.ExamApp.validateStoredExamData(
                  records['legacy-long'].questions,
                  null,
                  [],
                  'legacy-long',
                  records['legacy-long']
                )
              : { valid: false, errors: ['stored validator unavailable'] };

            vm.runInThisContext(fs.readFileSync('assets/js/exam-loader.js', 'utf8'));
            window.ExamApp.examsLoadedPromise.then(() => {
              process.stdout.write(JSON.stringify({
                strictLong: strictLong.valid,
                storedLong: storedLong.valid,
                loadedIds: Object.keys(window.userExams).sort(),
                warnings
              }));
            }).catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-loader.js",
        )

        self.assertFalse(payload["strictLong"])
        self.assertTrue(payload["storedLong"])
        self.assertEqual(["legacy-long"], payload["loadedIds"])
        self.assertTrue(
            any(
                "legacy-long" in warning
                and "120" in warning
                and "stored" in warning.lower()
                for warning in payload["warnings"]
            ),
            payload["warnings"],
        )

    def test_long_id_grandfathering_requires_storage_read_provenance(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const warnings = [];
            global.window = {
              ExamApp: {},
              userExams: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
            };
            window.window = window;
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {}
            };
            global.console = { log() {}, warn() {}, error() {} };

            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            window.ExamApp.warn = (...args) => warnings.push(args.map(String).join(' '));
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));

            function record(examId) {
              return {
                examId,
                questions: [{
                  id: 'x'.repeat(121),
                  question: 'Question?',
                  options: ['A', 'B'],
                  correct: 0
                }],
                metadata: null,
                labs: [],
                source: 'imported',
                trust: 'local-unverified',
                storage: 'browser'
              };
            }

            const forged = record('forged');
            const stored = record('stored');
            if (typeof window.ExamApp.markBrowserStoredExamRecord === 'function') {
              window.ExamApp.markBrowserStoredExamRecord(stored);
            }
            window.userExams.forged = forged;
            window.userExams.stored = stored;

            const validateStored = window.ExamApp.validateStoredExamData;
            const forgedDirect = validateStored(
              forged.questions,
              forged.metadata,
              forged.labs,
              forged.examId,
              forged
            );
            const storedDirect = validateStored(
              stored.questions,
              stored.metadata,
              stored.labs,
              stored.examId,
              stored
            );

            (async () => {
              const forgedRuntime = await window.examManager.loadExamData('forged');
              const storedRuntime = await window.examManager.loadExamData('stored');
              process.stdout.write(JSON.stringify({
                markerAvailable: typeof window.ExamApp.markBrowserStoredExamRecord === 'function',
                checkerAvailable: typeof window.ExamApp.isBrowserStoredExamRecord === 'function',
                forgedDirect: forgedDirect.valid,
                storedDirect: storedDirect.valid,
                forgedRuntime: Boolean(forgedRuntime),
                storedRuntime: Boolean(storedRuntime),
                storedRuntimeMarked: Boolean(
                  storedRuntime
                  && window.ExamApp.isBrowserStoredExamRecord?.(storedRuntime)
                ),
                warnings
              }));
            })().catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        self.assertTrue(payload["markerAvailable"])
        self.assertTrue(payload["checkerAvailable"])
        self.assertFalse(payload["forgedDirect"])
        self.assertTrue(payload["storedDirect"])
        self.assertFalse(payload["forgedRuntime"])
        self.assertTrue(payload["storedRuntime"])
        self.assertTrue(payload["storedRuntimeMarked"])

    def test_stored_validator_fallback_passes_provenance_options_in_runtime_helpers(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const source = fs.readFileSync('assets/js/script-multi-exam.js', 'utf8');
            global.window = {
              ExamApp: {
                validateExamData(...args) {
                  window.validationArgs = args;
                  return { valid: true, errors: [], warnings: [] };
                }
              }
            };
            global.document = {
              addEventListener() {},
              getElementById() { return null; },
              querySelectorAll() { return []; },
              body: { dataset: {} }
            };
            vm.runInThisContext(
              `${source}\nglobalThis.MultiExamSimulatorUnderTest = MultiExamSimulator;`
            );

            const storedRecord = { examId: 'legacy' };
            const simulator = Object.create(MultiExamSimulatorUnderTest.prototype);
            const valid = simulator.validateStoredExamData(
              [{ id: 'q1' }],
              null,
              [],
              'legacy',
              storedRecord
            );
            console.log(JSON.stringify({
              valid,
              argumentCount: window.validationArgs.length,
              optionsType: typeof window.validationArgs[3],
              preserved: window.validationArgs[3]?.storedRecord === storedRecord
            }));
            """,
            ROOT / "assets" / "js" / "script-multi-exam.js",
        )

        self.assertTrue(payload["valid"])
        self.assertEqual(4, payload["argumentCount"])
        self.assertEqual("object", payload["optionsType"])
        self.assertTrue(payload["preserved"])

    def test_exam_loader_fallback_passes_marked_storage_record_as_options(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const storedRecord = {
              examId: 'legacy',
              questions: [{ id: 'q1', question: 'Question?', options: ['A'], correct: 0 }],
              metadata: null,
              labs: [],
              storage: 'indexedDB'
            };
            let validationArgs = null;
            global.window = {
              ExamApp: {
                isSafeExamId() { return true; },
                sanitizeExamMetadata(value) { return value; },
                validateExamMetadata() { return { valid: true, errors: [], warnings: [] }; },
                validateExamData(...args) {
                  validationArgs = args;
                  return { valid: true, errors: [], warnings: [] };
                },
                isBrowserStoredExamRecord(record) { return record === storedRecord; },
                markBrowserStoredExamRecord(record) { return record; },
                warn() {},
                log() {},
                examStorage: {
                  async listExamIds() { return ['legacy']; },
                  async getExam() { return storedRecord; },
                  async listProgressExamIds() { return []; },
                  async getProgress() { return null; }
                }
              },
              userExams: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
            };
            window.window = window;
            global.fetch = async () => ({
              ok: true,
              async json() { return []; },
              async text() { return ''; }
            });
            global.console = { log() {}, warn() {}, error() {} };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-loader.js', 'utf8'));
            window.ExamApp.examsLoadedPromise.then(() => {
              process.stdout.write(JSON.stringify({
                loaded: Boolean(window.userExams.legacy),
                argumentCount: validationArgs?.length,
                optionsType: typeof validationArgs?.[3],
                preserved: validationArgs?.[3]?.storedRecord === storedRecord
              }));
            }).catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-loader.js",
        )

        self.assertTrue(payload["loaded"])
        self.assertEqual(4, payload["argumentCount"])
        self.assertEqual("object", payload["optionsType"])
        self.assertTrue(payload["preserved"])

    def test_exam_storage_migration_fallback_passes_marked_record_as_options(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const values = new Map([
              ['custom_legacy_questions', JSON.stringify([
                { id: 'q1', question: 'Question?', options: ['A'], correct: 0 }
              ])]
            ]);
            const marked = new WeakSet();
            let validationArgs = null;
            global.localStorage = {
              get length() { return values.size; },
              key(index) { return [...values.keys()][index] || null; },
              getItem(key) { return values.has(key) ? values.get(key) : null; },
              setItem(key, value) { values.set(key, String(value)); },
              removeItem(key) { values.delete(key); }
            };
            global.window = {
              indexedDB: null,
              ExamApp: {
                isSafeExamId() { return true; },
                sanitizeExamMetadata(value) { return value; },
                markBrowserStoredExamRecord(record) { marked.add(record); return record; },
                isBrowserStoredExamRecord(record) { return marked.has(record); },
                validateExamData(...args) {
                  validationArgs = args;
                  return { valid: true, errors: [], warnings: [] };
                },
                warn() {}
              }
            };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-storage.js', 'utf8'));
            window.ExamApp.examStorage.getExam('legacy').then((record) => {
              process.stdout.write(JSON.stringify({
                resolved: Boolean(record),
                argumentCount: validationArgs?.length,
                optionsType: typeof validationArgs?.[3],
                preserved: Boolean(
                  validationArgs?.[3]?.storedRecord
                  && marked.has(validationArgs[3].storedRecord)
                )
              }));
            }).catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-storage.js",
        )

        self.assertTrue(payload["resolved"])
        self.assertEqual(4, payload["argumentCount"])
        self.assertEqual("object", payload["optionsType"])
        self.assertTrue(payload["preserved"])

    def test_exam_manager_uses_each_validator_argument_contract(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const marked = new WeakSet();
            const calls = [];
            global.localStorage = {
              getItem() { return null; },
              setItem() {},
              removeItem() {}
            };
            global.window = {
              ExamApp: {
                isSafeExamId() { return true; },
                isBrowserStoredExamRecord(record) { return marked.has(record); },
                markBrowserStoredExamRecord(record) { marked.add(record); return record; },
                validateExamData(...args) {
                  calls.push(args);
                  return { valid: true, errors: [], warnings: [] };
                },
                validateExamMetadata() { return { valid: true, errors: [], warnings: [] }; },
                warn() {}
              },
              userExams: {}
            };
            global.console = { log() {}, warn() {}, error() {} };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));
            const manager = window.examManager;
            const question = { id: 'q1', question: 'Question?', options: ['A'], correct: 0 };
            const networkRecord = {
              questions: [question], metadata: {}, labs: [], source: 'bundled', storage: 'network'
            };
            const storedRecord = {
              questions: [question], metadata: {}, labs: [], source: 'imported', storage: 'indexedDB'
            };
            marked.add(storedRecord);
            manager.loadFromUserContent = async (examId) => (
              examId === 'network' ? networkRecord : storedRecord
            );
            manager.loadFromLocalStorage = async () => null;

            (async () => {
              const network = await manager.loadExamData('network');
              const stored = await manager.loadExamData('stored');
              process.stdout.write(JSON.stringify({
                networkLoaded: Boolean(network),
                storedLoaded: Boolean(stored),
                networkArgumentCount: calls[0]?.length,
                networkOptions: calls[0]?.[3] ?? null,
                storedArgumentCount: calls[1]?.length,
                storedPreserved: calls[1]?.[3]?.storedRecord === storedRecord
              }));
            })().catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """,
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        self.assertTrue(payload["networkLoaded"])
        self.assertTrue(payload["storedLoaded"])
        self.assertEqual(3, payload["networkArgumentCount"])
        self.assertIsNone(payload["networkOptions"])
        self.assertEqual(4, payload["storedArgumentCount"])
        self.assertTrue(payload["storedPreserved"])

    def test_stored_validation_reports_structured_grandfathering_with_dynamic_limit(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const loggedWarnings = [];
            global.window = {
              ExamApp: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
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
            window.ExamApp.warn = (...args) => loggedWarnings.push(args.map(String).join(' '));

            const question = (id) => ({
              id,
              question: 'Question?',
              options: ['A', 'B'],
              correct: 0
            });
            const record = {
              questions: [question('x'.repeat(121)), question('y'.repeat(121))],
              metadata: null,
              labs: []
            };
            window.ExamApp.markBrowserStoredExamRecord(record);
            const direct = window.ExamApp.validateExamData(
              record.questions,
              record.metadata,
              record.labs,
              { storedRecord: record }
            );

            const validateStored = window.ExamApp.validateStoredExamData;
            window.ExamApp.EXAM_LIMITS = {
              ...window.ExamApp.EXAM_LIMITS,
              maxQuestionIdLength: 64
            };
            window.ExamApp.validateExamData = () => ({
              valid: true,
              errors: [],
              warnings: ['Recovery wording may change independently.'],
              grandfatheredQuestionIdCount: 2
            });
            validateStored([], null, [], 'legacy-pack', record);

            console.log(JSON.stringify({
              directCount: direct.grandfatheredQuestionIdCount ?? null,
              loggedWarnings
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertEqual(2, payload["directCount"])
        self.assertEqual(1, len(payload["loggedWarnings"]))
        recovery_warning = payload["loggedWarnings"][0]
        self.assertIn("2 grandfathered question id(s)", recovery_warning)
        self.assertIn("limited to 64", recovery_warning)
        self.assertNotIn("limited to 120", recovery_warning)

    def test_stored_long_id_legacy_collision_quarantines_the_pack(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              ExamApp: {},
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
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

            function question(id) {
              return { id, question: 'Question?', options: ['A', 'B'], correct: 0 };
            }
            function storedRecord(examId, questions) {
              const record = {
                examId,
                questions,
                metadata: null,
                labs: [],
                source: 'imported',
                storage: 'indexedDB'
              };
              return typeof window.ExamApp.markBrowserStoredExamRecord === 'function'
                ? window.ExamApp.markBrowserStoredExamRecord(record)
                : record;
            }

            const first = 'a'.repeat(80) + '001pf8' + 'z'.repeat(40);
            const second = 'a'.repeat(80) + '00irj6' + 'z'.repeat(40);
            const single = storedRecord('single', [question(first)]);
            const collision = storedRecord('collision', [question(first), question(second)]);
            const validate = (record) => window.ExamApp.validateStoredExamData(
              record.questions,
              record.metadata,
              record.labs,
              record.examId,
              record
            );
            const singleResult = validate(single);
            const collisionResult = validate(collision);

            console.log(JSON.stringify({
              firstLength: first.length,
              secondLength: second.length,
              singleValid: singleResult.valid,
              collisionValid: collisionResult.valid,
              collisionErrors: collisionResult.errors
            }));
            """,
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertGreater(payload["firstLength"], 120)
        self.assertGreater(payload["secondLength"], 120)
        self.assertTrue(payload["singleValid"])
        self.assertFalse(payload["collisionValid"])
        self.assertTrue(
            any(
                "collision" in error.lower() and "quarantin" in error.lower()
                for error in payload["collisionErrors"]
            ),
            payload["collisionErrors"],
        )

    def test_all_stored_pack_revalidation_paths_use_the_recovery_validator(self):
        for relative_path in (
            "assets/js/exam-loader.js",
            "assets/js/exam-manager.js",
            "assets/js/exam-storage.js",
            "assets/js/script-multi-exam.js",
        ):
            with self.subTest(path=relative_path):
                source = (ROOT / relative_path).read_text(encoding="utf-8")
                self.assertIn("validateStoredExamData", source)
        for relative_path in (
            "assets/js/exam-manager.js",
            "assets/js/script-multi-exam.js",
        ):
            with self.subTest(provenance_path=relative_path):
                source = (ROOT / relative_path).read_text(encoding="utf-8")
                self.assertIn("isBrowserStoredExamRecord", source)

    def test_legacy_scheduler_and_storage_are_total_for_malformed_unicode(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            try {
              Object.defineProperty(String.prototype, 'toWellFormed', {
                configurable: true,
                value() { return { forged: true }; },
                writable: true
              });
            } catch (_) {
              String.prototype.toWellFormed = () => ({ forged: true });
            }

            global.window = {
              indexedDB: null,
              ExamApp: {
                isSafeExamId() { return true; },
                warn() {}
              },
              dispatchEvent() {}
            };
            global.CustomEvent = class CustomEvent {};
            vm.runInThisContext(fs.readFileSync('assets/js/study-scheduler.js', 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/study-storage.js', 'utf8'));

            const scheduler = window.ExamApp.studyScheduler;
            const storage = window.ExamApp.studyStorage;

            function capture(callback) {
              try {
                return { threw: false, value: callback() };
              } catch (error) {
                return { threw: true, name: error && error.name };
              }
            }

            function isWellFormed(value) {
              for (let index = 0; index < value.length; index++) {
                const unit = value.charCodeAt(index);
                if (unit >= 0xD800 && unit <= 0xDBFF) {
                  const next = value.charCodeAt(index + 1);
                  if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
                  index++;
                } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
                  return false;
                }
              }
              return true;
            }

            function inspectScheduler(value) {
              const first = capture(() => scheduler.normalizeQuestionId(value));
              const second = capture(() => scheduler.normalizeQuestionId(value));
              return {
                threw: first.threw || second.threw,
                deterministic: !first.threw && !second.threw && first.value === second.value,
                wellFormed: !first.threw && isWellFormed(first.value)
              };
            }

            function inspectStorage(value) {
              const normalized = capture(() => storage.normalizeQuestionId(value));
              const normalizedAgain = capture(() => storage.normalizeQuestionId(value));
              const encoded = capture(() => storage.encodeQuestionId(value));
              const key = capture(() => storage.buildKey('az900', value));
              const keyAgain = capture(() => storage.buildKey('az900', value));
              return {
                normalizeThrew: normalized.threw,
                encodeThrew: encoded.threw,
                keyThrew: key.threw,
                deterministic: (
                  !normalized.threw
                  && !normalizedAgain.threw
                  && !key.threw
                  && !keyAgain.threw
                  && normalized.value === normalizedAgain.value
                  && key.value === keyAgain.value
                ),
                normalizedWellFormed: !normalized.threw && isWellFormed(normalized.value)
              };
            }

            function legacyHash(value) {
              let hash = 2166136261;
              for (let index = 0; index < value.length; index++) {
                hash ^= value.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
              }
              return (hash >>> 0).toString(16).padStart(8, '0');
            }

            function legacyLongNormalization(value) {
              return `q_${legacyHash(value)}_${encodeURIComponent(value).slice(0, 80)}`;
            }

            const malformed = {
              shortHigh: 'short-\uD800',
              shortLow: 'short-\uDC00',
              longHigh: 'x'.repeat(121) + '\uD800',
              longLow: 'x'.repeat(121) + '\uDC00'
            };
            const schedulerCases = Object.fromEntries(
              Object.entries(malformed).map(([name, value]) => [name, inspectScheduler(value)])
            );
            const storageCases = Object.fromEntries(
              Object.entries(malformed).map(([name, value]) => [name, inspectStorage(value)])
            );

            window.ExamApp.studyScheduler = undefined;
            const storageWithoutScheduler = inspectStorage(malformed.longHigh);
            window.ExamApp.studyScheduler = {
              normalizeQuestionId() { throw new URIError('legacy scheduler failure'); }
            };
            const storageWithThrowingScheduler = inspectStorage(malformed.shortLow);

            const longWellFormed = 'well-formed-'.repeat(15);
            window.ExamApp.studyScheduler = scheduler;
            console.log(JSON.stringify({
              nativeReturnsNonString: (
                typeof ''.toWellFormed === 'function'
                && typeof ''.toWellFormed() !== 'string'
              ),
              schedulerCases,
              storageCases,
              storageWithoutScheduler,
              storageWithThrowingScheduler,
              validEmojiPreserved: scheduler.normalizeQuestionId('emoji-\uD83D\uDE00') === 'emoji-\uD83D\uDE00',
              numericPreserved: scheduler.normalizeQuestionId(42) === '42',
              longWellFormedSemanticsPreserved: (
                scheduler.normalizeQuestionId(longWellFormed)
                === legacyLongNormalization(longWellFormed)
              )
            }));
            """,
            ROOT / "assets" / "js" / "study-scheduler.js",
        )

        self.assertTrue(payload["nativeReturnsNonString"])
        for group_name in ("schedulerCases", "storageCases"):
            for case_name, result in payload[group_name].items():
                with self.subTest(group=group_name, case=case_name):
                    for field, value in result.items():
                        if field.endswith("Threw") or field == "threw":
                            self.assertFalse(value, field)
                        else:
                            self.assertTrue(value, field)

        for name in ("storageWithoutScheduler", "storageWithThrowingScheduler"):
            for field, value in payload[name].items():
                with self.subTest(group=name, field=field):
                    if field.endswith("Threw"):
                        self.assertFalse(value)
                    else:
                        self.assertTrue(value)

        self.assertTrue(payload["validEmojiPreserved"])
        self.assertTrue(payload["numericPreserved"])
        self.assertTrue(payload["longWellFormedSemanticsPreserved"])

    def test_storage_preserves_legacy_long_well_formed_ids_and_keys(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              indexedDB: null,
              ExamApp: {
                isSafeExamId() { return true; },
                warn() {}
              },
              dispatchEvent() {}
            };
            global.CustomEvent = class CustomEvent {};
            vm.runInThisContext(fs.readFileSync('assets/js/study-scheduler.js', 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/study-storage.js', 'utf8'));

            const scheduler = window.ExamApp.studyScheduler;
            const storage = window.ExamApp.studyStorage;
            const examId = 'az900';
            const questionId = 'well-formed-'.repeat(15);

            function legacyHash(value) {
              let hash = 2166136261;
              for (let index = 0; index < value.length; index++) {
                hash ^= value.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
              }
              return (hash >>> 0).toString(16).padStart(8, '0');
            }

            function legacyNormalize(value) {
              const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
              if (!normalized) return '';
              if (normalized.length <= 120) return normalized;
              return `q_${legacyHash(normalized)}_${encodeURIComponent(normalized).slice(0, 80)}`;
            }

            function legacyBuildKey(exam, question) {
              const normalizedExam = String(exam || '').trim();
              const normalizedQuestion = legacyNormalize(question);
              const encodedQuestion = encodeURIComponent(normalizedQuestion.trim()).slice(0, 80);
              return `studyStats_${normalizedExam}_${legacyHash(normalizedQuestion)}_${encodedQuestion}`;
            }

            function actualValues() {
              return {
                normalized: storage.normalizeQuestionId(questionId),
                legacyKey: typeof storage.buildLegacyKey === 'function'
                  ? storage.buildLegacyKey(examId, questionId)
                  : null,
                key: storage.buildKey(examId, questionId)
              };
            }

            const expected = {
              normalized: legacyNormalize(questionId),
              legacyKey: legacyBuildKey(examId, questionId)
            };
            const withScheduler = actualValues();
            window.ExamApp.studyScheduler = undefined;
            const withoutScheduler = actualValues();
            window.ExamApp.studyScheduler = scheduler;

            console.log(JSON.stringify({ expected, withScheduler, withoutScheduler }));
            """,
            ROOT / "assets" / "js" / "study-storage.js",
        )

        for mode in ("withScheduler", "withoutScheduler"):
            with self.subTest(mode=mode):
                self.assertEqual(
                    payload["expected"]["normalized"],
                    payload[mode]["normalized"],
                )
                self.assertEqual(
                    payload["expected"]["legacyKey"],
                    payload[mode]["legacyKey"],
                )
                self.assertTrue(payload[mode]["key"].startswith("studyStats:v2:"))
                self.assertNotEqual(payload["expected"]["legacyKey"], payload[mode]["key"])
        self.assertEqual(payload["withScheduler"]["key"], payload["withoutScheduler"]["key"])

    def test_public_pack_format_documents_question_id_constraints(self):
        documentation = (ROOT / "docs" / "Pack-Format.md").read_text(encoding="utf-8")
        self.assertIn("at most 120 UTF-16 code units", documentation)
        self.assertIn("well-formed Unicode", documentation)
        self.assertIn("safe integral number", documentation)
        self.assertIn("internal whitespace", documentation)
        self.assertIn("canonical", documentation)
        self.assertIn("quarantin", documentation.lower())
        self.assertIn("legacy storage identity collision", documentation.lower())


if __name__ == "__main__":
    unittest.main()
