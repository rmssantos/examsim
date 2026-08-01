"""Focused metadata complexity budgets shared by browser and repository validation."""

from __future__ import annotations

import importlib.util
import json
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
    "validate_exam_packs_metadata_hardening",
    ROOT / "tools" / "validate-exam-packs.py",
)
VALIDATOR = importlib.util.module_from_spec(VALIDATOR_SPEC)
sys.modules[VALIDATOR_SPEC.name] = VALIDATOR
VALIDATOR_SPEC.loader.exec_module(VALIDATOR)


def complete_taxonomy(**overrides):
    metadata = {
        "vendor": "Vendor",
        "certificationCode": "CERT-100",
        "domains": ["Cloud"],
        "level": "Associate",
        "productFamily": "Platform",
        "contentType": "practice-exam",
        "commercialStatus": "free",
    }
    metadata.update(overrides)
    return metadata


def metadata_with_depth(depth: int):
    value = "leaf"
    for _ in range(depth):
        value = {"child": value}
    return value


def metadata_with_nodes(last_array_size: int):
    metadata = {f"bucket{index}": [0] * 100 for index in range(49)}
    metadata["bucket49"] = [0] * last_array_size
    return metadata


class MetadataHardeningTests(unittest.TestCase):
    @staticmethod
    def run_node(script: str, source: Path = ROOT / "assets" / "js" / "utils.js"):
        return run_node_snippet(source, textwrap.dedent(script), timeout=30)

    @staticmethod
    def cli_metadata_valid(metadata) -> bool:
        validator = VALIDATOR.PackValidator(ROOT)
        validator.validate_metadata(
            "metadata-test",
            metadata,
            ROOT / "metadata-test.json",
            [],
        )
        return not validator.issues

    def test_runtime_enforces_exact_metadata_boundaries_and_handles_cycles(self):
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

            const validate = metadata => window.ExamApp.validateExamMetadata(metadata);
            const taxonomy = overrides => ({
              vendor: 'Vendor',
              certificationCode: 'CERT-100',
              domains: ['Cloud'],
              level: 'Associate',
              productFamily: 'Platform',
              contentType: 'practice-exam',
              commercialStatus: 'free',
              ...overrides
            });
            const buildDepth = depth => {
              let value = 'leaf';
              for (let index = 0; index < depth; index++) value = { child: value };
              return value;
            };
            const buildNodes = lastArraySize => {
              const metadata = {};
              for (let index = 0; index < 49; index++) {
                metadata[`bucket${index}`] = Array(100).fill(0);
              }
              metadata.bucket49 = Array(lastArraySize).fill(0);
              return metadata;
            };
            const keyObject = key => ({ [key]: 'value' });
            const keyCountObject = count => Object.fromEntries(
              Array.from({ length: count }, (_, index) => [`key${index}`, index])
            );

            const cycle = { name: 'cycle' };
            cycle.self = cycle;
            cycle.shared = { value: 'shared' };
            cycle.other = cycle.shared;

            const errorBomb = {};
            for (let objectIndex = 0; objectIndex < 100; objectIndex++) {
              errorBomb[`object${objectIndex}`] = Object.fromEntries(
                Array.from(
                  { length: 100 },
                  (_, keyIndex) => [`${'k'.repeat(201)}-${objectIndex}-${keyIndex}`, 'x'.repeat(5001)]
                )
              );
            }

            const exact = {
              genericArray: { modules: Array(100).fill('module') },
              domains: taxonomy({ domains: Array(20).fill('Cloud') }),
              taxonomyText: taxonomy({ vendor: '😀'.repeat(100) }),
              taxonomyEntry: taxonomy({ domains: ['😀'.repeat(100)] }),
              genericString: { description: '😀'.repeat(2500) },
              keyLength: keyObject('😀'.repeat(100)),
              keyCount: keyCountObject(100),
              depth: buildDepth(10),
              nodes: buildNodes(49)
            };
            const over = {
              genericArray: { modules: Array(101).fill('module') },
              domains: taxonomy({ domains: Array(21).fill('Cloud') }),
              taxonomyText: taxonomy({ vendor: `${'😀'.repeat(100)}x` }),
              taxonomyEntry: taxonomy({ domains: [`${'😀'.repeat(100)}x`] }),
              genericString: { description: `${'😀'.repeat(2500)}x` },
              keyLength: keyObject(`${'😀'.repeat(100)}x`),
              keyCount: keyCountObject(101),
              depth: buildDepth(11),
              nodes: buildNodes(50)
            };

            const outcomes = {};
            for (const name of Object.keys(exact)) {
              outcomes[name] = {
                exact: validate(exact[name]).valid,
                over: validate(over[name]).valid
              };
            }
            const optional = {
              noTaxonomy: validate({ description: 'Private pack' }).valid,
              oneField: validate({ vendor: 'Vendor' }).valid,
              emptyText: validate({ vendor: '' }).valid,
              wrongListType: validate({ domains: 'Cloud' }).valid,
              emptyList: validate({ domains: [] }).valid,
              wrongEntryType: validate({ domains: [42] }).valid
            };
            const cycleResult = validate(cycle);
            const errorBombResult = validate(errorBomb);
            const limits = window.ExamApp.EXAM_LIMITS;
            console.log(JSON.stringify({
              outcomes,
              optional,
              cycle: { valid: cycleResult.valid, errors: cycleResult.errors.length },
              errorBombErrors: errorBombResult.errors.length,
              limits: {
                genericArray: limits.maxMetadataListItems,
                taxonomyList: limits.maxMetadataTaxonomyListItems,
                taxonomyString: limits.maxMetadataTaxonomyStringLength,
                genericString: limits.maxMetadataStringLength,
                objectKeys: limits.maxMetadataObjectKeys,
                keyLength: limits.maxMetadataKeyLength,
                depth: limits.maxMetadataDepth,
                nodes: limits.maxMetadataNodes
              }
            }));
            """
        )

        self.assertEqual(
            {
                "genericArray": 100,
                "taxonomyList": 20,
                "taxonomyString": 200,
                "genericString": 5000,
                "objectKeys": 100,
                "keyLength": 200,
                "depth": 10,
                "nodes": 5000,
            },
            payload["limits"],
        )
        for name, result in payload["outcomes"].items():
            with self.subTest(boundary=name):
                self.assertTrue(result["exact"], name)
                self.assertFalse(result["over"], name)
        self.assertEqual(
            {
                "noTaxonomy": True,
                "oneField": False,
                "emptyText": False,
                "wrongListType": False,
                "emptyList": False,
                "wrongEntryType": False,
            },
            payload["optional"],
        )
        self.assertFalse(payload["cycle"]["valid"], payload["cycle"])
        self.assertLessEqual(payload["errorBombErrors"], 100)

    def test_cli_mirrors_runtime_metadata_boundaries_for_json_trees(self):
        exact = {
            "genericArray": {"modules": ["module"] * 100},
            "domains": complete_taxonomy(domains=["Cloud"] * 20),
            "taxonomyText": complete_taxonomy(vendor="😀" * 100),
            "taxonomyEntry": complete_taxonomy(domains=["😀" * 100]),
            "genericString": {"description": "😀" * 2500},
            "keyLength": {"😀" * 100: "value"},
            "keyCount": {f"key{index}": index for index in range(100)},
            "depth": metadata_with_depth(10),
            "nodes": metadata_with_nodes(49),
        }
        over = {
            "genericArray": {"modules": ["module"] * 101},
            "domains": complete_taxonomy(domains=["Cloud"] * 21),
            "taxonomyText": complete_taxonomy(vendor=("😀" * 100) + "x"),
            "taxonomyEntry": complete_taxonomy(domains=[("😀" * 100) + "x"]),
            "genericString": {"description": ("😀" * 2500) + "x"},
            "keyLength": {("😀" * 100) + "x": "value"},
            "keyCount": {f"key{index}": index for index in range(101)},
            "depth": metadata_with_depth(11),
            "nodes": metadata_with_nodes(50),
        }
        cli_outcomes = {
            name: {
                "exact": self.cli_metadata_valid(exact[name]),
                "over": self.cli_metadata_valid(over[name]),
            }
            for name in exact
        }
        taxonomy_fields = (
            "vendor",
            "certificationCode",
            "domains",
            "level",
            "productFamily",
            "contentType",
            "commercialStatus",
        )
        cli_partial_taxonomy = {
            f"missing_{field}": self.cli_metadata_valid(
                {
                    key: value
                    for key, value in complete_taxonomy().items()
                    if key != field
                }
            )
            for field in taxonomy_fields
        }

        runtime_outcomes = self.run_node(
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            const taxonomy = overrides => ({
              vendor: 'Vendor',
              certificationCode: 'CERT-100',
              domains: ['Cloud'],
              level: 'Associate',
              productFamily: 'Platform',
              contentType: 'practice-exam',
              commercialStatus: 'free',
              ...overrides
            });
            const depth = count => {
              let value = 'leaf';
              for (let index = 0; index < count; index++) value = { child: value };
              return value;
            };
            const nodes = lastSize => {
              const value = {};
              for (let index = 0; index < 49; index++) value[`key${index}`] = Array(100).fill(0);
              value.key49 = Array(lastSize).fill(0);
              return value;
            };
            const exact = {
              genericArray: { modules: Array(100).fill('module') },
              domains: taxonomy({ domains: Array(20).fill('Cloud') }),
              taxonomyText: taxonomy({ vendor: '😀'.repeat(100) }),
              taxonomyEntry: taxonomy({ domains: ['😀'.repeat(100)] }),
              genericString: { description: '😀'.repeat(2500) },
              keyLength: { ['😀'.repeat(100)]: 'value' },
              keyCount: Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`key${index}`, index])),
              depth: depth(10),
              nodes: nodes(49)
            };
            const over = {
              genericArray: { modules: Array(101).fill('module') },
              domains: taxonomy({ domains: Array(21).fill('Cloud') }),
              taxonomyText: taxonomy({ vendor: `${'😀'.repeat(100)}x` }),
              taxonomyEntry: taxonomy({ domains: [`${'😀'.repeat(100)}x`] }),
              genericString: { description: `${'😀'.repeat(2500)}x` },
              keyLength: { [`${'😀'.repeat(100)}x`]: 'value' },
              keyCount: Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`key${index}`, index])),
              depth: depth(11),
              nodes: nodes(50)
            };
            const outcomes = {};
            for (const name of Object.keys(exact)) {
              outcomes[name] = {
                exact: window.ExamApp.validateExamMetadata(exact[name]).valid,
                over: window.ExamApp.validateExamMetadata(over[name]).valid
              };
            }
            const taxonomyFields = [
              'vendor',
              'certificationCode',
              'domains',
              'level',
              'productFamily',
              'contentType',
              'commercialStatus'
            ];
            const partialTaxonomy = {};
            taxonomyFields.forEach(field => {
              const metadata = taxonomy({});
              delete metadata[field];
              partialTaxonomy[`missing_${field}`] = window.ExamApp.validateExamMetadata(metadata).valid;
            });
            console.log(JSON.stringify({ outcomes, partialTaxonomy }));
            """
        )

        self.assertEqual(runtime_outcomes["outcomes"], cli_outcomes)
        self.assertEqual(runtime_outcomes["partialTaxonomy"], cli_partial_taxonomy)
        self.assertTrue(all(result is False for result in cli_partial_taxonomy.values()))
        for name, result in cli_outcomes.items():
            with self.subTest(boundary=name):
                self.assertTrue(result["exact"], name)
                self.assertFalse(result["over"], name)

        self.assertFalse(self.cli_metadata_valid({"vendor": "Vendor"}))

    def test_runtime_rejects_hostile_or_non_json_metadata_without_invoking_accessors(self):
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            let objectGetterHits = 0;
            const objectGetter = {};
            Object.defineProperty(objectGetter, 'description', {
              enumerable: true,
              get() { objectGetterHits++; throw new Error('object getter invoked'); }
            });

            let semanticGetterHits = 0;
            const semanticGetter = {};
            Object.defineProperty(semanticGetter, 'id', {
              enumerable: true,
              get() { semanticGetterHits++; throw new Error('semantic getter invoked'); }
            });

            let arrayGetterHits = 0;
            const accessorArray = ['safe'];
            Object.defineProperty(accessorArray, '0', {
              enumerable: true,
              configurable: true,
              get() { arrayGetterHits++; throw new Error('array getter invoked'); }
            });

            const symbolKey = { value: 'safe' };
            symbolKey[Symbol('hidden')] = 'not-json';
            const revoked = Proxy.revocable({ value: 'safe' }, {});
            revoked.revoke();
            const nestedRevoked = Proxy.revocable({ value: 'safe' }, {});
            nestedRevoked.revoke();
            const nullPrototype = Object.create(null);
            nullPrototype.description = 'safe';

            const cases = {
              objectGetter,
              semanticGetter,
              arrayGetter: { modules: accessorArray },
              nonPlainObject: { nested: new Date() },
              symbolKey,
              revokedProxy: revoked.proxy,
              nestedRevokedProxy: { nested: nestedRevoked.proxy },
              undefinedValue: { nested: undefined },
              nonFiniteNumber: { nested: Infinity },
              nullPrototype
            };
            const outcomes = {};
            for (const [name, metadata] of Object.entries(cases)) {
              try {
                const result = window.ExamApp.validateExamMetadata(metadata);
                outcomes[name] = { threw: false, valid: result.valid, errors: result.errors };
              } catch (error) {
                outcomes[name] = { threw: true, message: error.message };
              }
            }
            const sanitizedSymbol = window.ExamApp.sanitizeExamMetadata(symbolKey);
            console.log(JSON.stringify({
              outcomes,
              sanitizedSymbolCount: Object.getOwnPropertySymbols(sanitizedSymbol).length,
              getterHits: { objectGetterHits, semanticGetterHits, arrayGetterHits }
            }));
            """
        )

        self.assertEqual(
            {"objectGetterHits": 0, "semanticGetterHits": 0, "arrayGetterHits": 0},
            payload["getterHits"],
        )
        for name, outcome in payload["outcomes"].items():
            with self.subTest(case=name):
                self.assertFalse(outcome["threw"], outcome)
                if name in {"nullPrototype", "symbolKey"}:
                    self.assertTrue(outcome["valid"], outcome)
                else:
                    self.assertFalse(outcome["valid"], outcome)
                    self.assertTrue(outcome["errors"], outcome)
        self.assertEqual(0, payload["sanitizedSymbolCount"])

    def test_metadata_sanitizer_fails_closed_for_rejected_root_shapes(self):
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const arrayMetadata = [];
            arrayMetadata.pro = { url: 'https://example.invalid/buy' };

            class MetadataRecord {}
            const nonPlainMetadata = new MetadataRecord();
            nonPlainMetadata.source = 'bundled';

            const oversizedMetadata = Object.fromEntries(
              Array.from({ length: 101 }, (_, index) => [`field${index}`, index])
            );
            oversizedMetadata.trust = 'bundled';

            let getterHits = 0;
            const accessorMetadata = {};
            Object.defineProperty(accessorMetadata, 'preview', {
              enumerable: true,
              get() {
                getterHits++;
                throw new Error('metadata getter executed');
              }
            });

            const rejected = [
              arrayMetadata,
              nonPlainMetadata,
              oversizedMetadata,
              accessorMetadata
            ].map(metadata => window.ExamApp.sanitizeExamMetadata(metadata) === null);

            console.log(JSON.stringify({ rejected, getterHits }));
            """
        )

        self.assertEqual([True, True, True, True], payload["rejected"])
        self.assertEqual(0, payload["getterHits"])

    def test_metadata_rejection_prevents_storage_writes_and_registry_updates(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            let localWrites = 0;
            let indexedWrites = 0;
            let registrations = 0;
            let getterHits = 0;
            global.window = {
              indexedDB: null,
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem() { localWrites++; },
              removeItem() {},
              get length() { return 0; },
              key() { return null; }
            };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            window.ExamApp.warn = () => {};
            window.ExamApp.addToRegistry = () => { registrations++; };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-storage.js', 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));

            const metadata = {};
            Object.defineProperty(metadata, 'preview', {
              enumerable: true,
              get() {
                getterHits++;
                throw new Error('metadata getter executed');
              }
            });
            const questions = [{
              id: 'q1',
              question: 'Question?',
              question_type: 'STANDARD',
              options: ['A', 'B'],
              correct: 0
            }];
            window.ExamApp.examStorage.putRecord = async () => {
              indexedWrites++;
              return true;
            };

            (async () => {
              let indexedRejected = false;
              let legacyRejected = false;
              let managerRejected = false;
              try {
                await window.ExamApp.examStorage.putExam('hostile', questions, metadata);
              } catch (_) {
                indexedRejected = true;
              }
              try {
                window.ExamApp.examStorage.putLegacyExam('hostile', questions, metadata);
              } catch (_) {
                legacyRejected = true;
              }
              try {
                window.ExamApp.examManager.sanitizeMetadata(metadata, false);
              } catch (_) {
                managerRejected = true;
              }
              console.log(JSON.stringify({
                indexedRejected,
                legacyRejected,
                managerRejected,
                indexedWrites,
                localWrites,
                registrations,
                getterHits
              }));
            })();
            """
        )

        self.assertTrue(payload["indexedRejected"], payload)
        self.assertTrue(payload["legacyRejected"], payload)
        self.assertTrue(payload["managerRejected"], payload)
        self.assertEqual(0, payload["indexedWrites"], payload)
        self.assertEqual(0, payload["localWrites"], payload)
        self.assertEqual(0, payload["registrations"], payload)
        self.assertEqual(0, payload["getterHits"], payload)

    def test_bundled_metadata_rejection_does_not_register_exam(self):
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            window.ExamApp.log = () => {};
            window.ExamApp.warn = () => {};
            window.ExamApp.examStorage = null;
            global.fetch = async url => {
              if (String(url).endsWith('user-content/exams/index.json')) {
                return { ok: true, json: async () => ['hostile'] };
              }
              if (String(url).endsWith('user-content/exams/hostile/metadata.json')) {
                const metadata = [];
                metadata.source = 'bundled';
                return { ok: true, json: async () => metadata };
              }
              throw new Error(`Unexpected fetch: ${url}`);
            };
            vm.runInThisContext(fs.readFileSync('assets/js/exam-loader.js', 'utf8'));

            window.ExamApp.examsLoadedPromise.then(() => {
              console.log(JSON.stringify({
                registered: Object.prototype.hasOwnProperty.call(window.userExams, 'hostile')
              }));
            });
            """
        )

        self.assertFalse(payload["registered"], payload)

    def test_runtime_metadata_uses_capped_json_visible_key_enumeration(self):
        source = (ROOT / "assets" / "js" / "utils.js").read_text(encoding="utf-8")
        markers = (
            (
                "sanitizer",
                "window.ExamApp.sanitizeExamMetadata",
                "window.ExamApp.OFFICIAL_DOCUMENTATION_HOSTS",
            ),
            (
                "validator",
                "window.ExamApp.validateExamMetadata",
                "window.ExamApp.validateExamLabs",
            ),
        )
        for label, start_marker, end_marker in markers:
            with self.subTest(section=label):
                start = source.find(start_marker)
                end = source.find(end_marker)
                self.assertNotEqual(-1, start, f"{label} start marker is missing")
                self.assertNotEqual(-1, end, f"{label} end marker is missing")
                self.assertLess(start, end, f"{label} markers are out of order")
                section = source[start:end]
                self.assertNotIn("Reflect.ownKeys", section)
                self.assertIn("for (const key in", section)

    def test_cli_semantic_subtrees_finish_with_bounded_constant_diagnostics(self):
        large_list = [
            {"nested": "x" * 100, "index": index}
            for index in range(100)
        ]
        cases = {
            "id": {"id": large_list},
            "totalQuestions": {"totalQuestions": large_list},
            "labCount": {"labCount": large_list},
            "contentOrigin": {"contentOrigin": large_list},
        }

        for field, metadata in cases.items():
            with self.subTest(field=field):
                validator = VALIDATOR.PackValidator(ROOT)
                try:
                    validator.validate_metadata(
                        "metadata-test",
                        metadata,
                        ROOT / "metadata-test.json",
                        [],
                    )
                except Exception as error:  # pragma: no cover - assertion reports hostile crash
                    self.fail(f"{field} validation raised {type(error).__name__}: {error}")
                messages = [issue.message for issue in validator.issues]
                self.assertTrue(messages, field)
                self.assertLessEqual(len(messages), 100)
                self.assertLessEqual(max(map(len, messages)), 300)

    def test_cli_rejects_metadata_numbers_that_are_non_finite_in_javascript(self):
        invalid_values = {
            "nan": float("nan"),
            "positive_infinity": float("inf"),
            "negative_infinity": float("-inf"),
            "javascript_overflow": 10**400,
        }
        for name, value in invalid_values.items():
            with self.subTest(case=name):
                validator = VALIDATOR.PackValidator(ROOT)
                validator.validate_metadata(
                    "metadata-test",
                    {"customNumber": value},
                    ROOT / "metadata-test.json",
                    [],
                )
                messages = [issue.message for issue in validator.issues]
                self.assertTrue(
                    any("finite JSON number" in message for message in messages),
                    messages,
                )

        for value in (0, 1.5, 10**300):
            with self.subTest(case=f"finite_{value}"):
                validator = VALIDATOR.PackValidator(ROOT)
                validator.validate_metadata(
                    "metadata-test",
                    {"customNumber": value},
                    ROOT / "metadata-test.json",
                    [],
                )
                self.assertEqual([], [issue.message for issue in validator.issues])

    def test_cli_question_count_diagnostic_names_the_dump_question_count(self):
        validator = VALIDATOR.PackValidator(ROOT)
        validator.validate_metadata(
            "metadata-test",
            {"questionCount": 2},
            ROOT / "metadata-test.json",
            [{}],
        )

        self.assertEqual(
            ["questionCount cannot exceed the dump question count"],
            [issue.message for issue in validator.issues],
        )

    def test_import_rejects_oversized_metadata_before_any_write(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const utilsSource = fs.readFileSync(process.argv[1], 'utf8');
            const managerSource = fs.readFileSync('assets/js/exam-manager.js', 'utf8');
            const writes = [];
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem(key) { writes.push(`set:${key}`); },
              removeItem(key) { writes.push(`remove:${key}`); }
            };
            vm.runInThisContext(utilsSource);
            vm.runInThisContext(managerSource);

            (async () => {
              let message = '';
              try {
                await window.ExamApp.examManager.importExam('metadata-test', {
                  questions: [{ id: 'q1', question: 'Question?', options: ['A', 'B'], correct: 0 }],
                  metadata: { description: 'x'.repeat(5001) },
                  labs: []
                });
              } catch (error) {
                message = error.message || String(error);
              }
              console.log(JSON.stringify({
                message,
                writes,
                registered: Object.keys(window.userExams)
              }));
            })();
            """
        )

        self.assertIn("metadata", payload["message"].lower())
        self.assertEqual([], payload["writes"])
        self.assertEqual([], payload["registered"])

    def test_import_validates_raw_metadata_before_sanitizing_or_writing(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const utilsSource = fs.readFileSync(process.argv[1], 'utf8');
            const managerSource = fs.readFileSync('assets/js/exam-manager.js', 'utf8');
            const writes = [];
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem(key) { writes.push(`set:${key}`); },
              removeItem(key) { writes.push(`remove:${key}`); }
            };
            vm.runInThisContext(utilsSource);
            vm.runInThisContext(managerSource);

            let getterHits = 0;
            const accessorMetadata = {};
            Object.defineProperty(accessorMetadata, 'description', {
              enumerable: true,
              get() {
                getterHits++;
                throw new Error('metadata getter executed');
              }
            });
            const questions = [
              { id: 'q1', question: 'Question?', options: ['A', 'B'], correct: 0 }
            ];

            async function rejectImport(examId, metadata) {
              try {
                await window.ExamApp.examManager.importExam(examId, {
                  questions,
                  metadata,
                  labs: []
                });
                return '';
              } catch (error) {
                return error.message || String(error);
              }
            }

            (async () => {
              const accessorMessage = await rejectImport('accessor-metadata', accessorMetadata);
              const nonPlainMessage = await rejectImport('non-plain-metadata', new Date(0));
              console.log(JSON.stringify({
                accessorMessage,
                nonPlainMessage,
                getterHits,
                writes,
                registered: Object.keys(window.userExams)
              }));
            })();
            """
        )

        self.assertIn("metadata", payload["accessorMessage"].lower())
        self.assertIn("metadata", payload["nonPlainMessage"].lower())
        self.assertEqual(0, payload["getterHits"])
        self.assertEqual([], payload["writes"])
        self.assertEqual([], payload["registered"])

    def test_import_snapshots_json_visible_pack_before_validation_or_derivation(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const utilsSource = fs.readFileSync(process.argv[1], 'utf8');
            const managerSource = fs.readFileSync('assets/js/exam-manager.js', 'utf8');
            const writes = [];
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = {
              getItem() { return null; },
              setItem(key) { writes.push(`set:${key}`); },
              removeItem(key) { writes.push(`remove:${key}`); }
            };
            vm.runInThisContext(utilsSource);
            vm.runInThisContext(managerSource);

            const manager = window.ExamApp.examManager;
            let getterHits = 0;
            let generateCalls = 0;
            const originalGenerate = manager.generateMetadata.bind(manager);
            manager.generateMetadata = (...args) => {
              generateCalls++;
              return originalGenerate(...args);
            };
            const validQuestion = () => ({
              id: 'q1', question: 'Question?', options: ['A', 'B'], correct: 0
            });
            const accessorPack = field => {
              const pack = {};
              Object.defineProperty(pack, field, {
                enumerable: true,
                get() {
                  getterHits++;
                  throw new Error(`${field} getter executed`);
                }
              });
              if (field !== 'questions') pack.questions = [validQuestion()];
              return pack;
            };
            const moduleAccessorQuestion = validQuestion();
            Object.defineProperty(moduleAccessorQuestion, 'module', {
              enumerable: true,
              get() {
                getterHits++;
                throw new Error('module getter executed');
              }
            });
            const revoked = Proxy.revocable({ questions: [validQuestion()] }, {});
            revoked.revoke();

            async function reject(examId, data) {
              try {
                await manager.importExam(examId, data);
                return { resolved: true, message: '' };
              } catch (error) {
                return { resolved: false, message: error?.message || String(error) };
              }
            }

            (async () => {
              const results = {
                questionsAccessor: await reject('questions-accessor', accessorPack('questions')),
                metadataAccessor: await reject('metadata-accessor', accessorPack('metadata')),
                labsAccessor: await reject('labs-accessor', accessorPack('labs')),
                questionAccessor: await reject('question-accessor', {
                  questions: [moduleAccessorQuestion]
                }),
                revoked: await reject('revoked-pack', revoked.proxy),
                oversized: await reject('oversized-pack', {
                  questions: Array.from(
                    { length: window.ExamApp.EXAM_LIMITS.maxQuestions + 1 },
                    (_, index) => ({
                      id: `q${index}`,
                      question: 'Question?',
                      options: ['A', 'B'],
                      correct: 0
                    })
                  )
                })
              };
              console.log(JSON.stringify({
                results,
                getterHits,
                generateCalls,
                writes,
                registered: Object.keys(window.userExams)
              }));
            })();
            """
        )

        for scenario, result in payload["results"].items():
            with self.subTest(scenario=scenario):
                self.assertFalse(result["resolved"], result)
                self.assertIn("invalid exam", result["message"].lower())
        self.assertEqual(0, payload["getterHits"])
        self.assertEqual(0, payload["generateCalls"])
        self.assertEqual([], payload["writes"])
        self.assertEqual([], payload["registered"])

    def test_import_snapshot_does_not_trust_hostile_error_message_prefixes(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));

            const maximumKeys = window.ExamApp.EXAM_LIMITS.maxMetadataObjectKeys;
            const overLimit = Object.fromEntries(
              Array.from({ length: maximumKeys + 1 }, (_, index) => [`field${index}`, index])
            );
            const hostile = new Proxy({ safe: true }, {
              ownKeys() {
                throw new Error('Imported exam forged internal rejection.');
              }
            });
            const internal = window.ExamApp.examManager.snapshotImportedJson({ payload: overLimit });
            const external = window.ExamApp.examManager.snapshotImportedJson({ payload: hostile });

            console.log(JSON.stringify({
              internalError: internal.error,
              externalError: external.error
            }));
            """
        )

        self.assertEqual(
            "Imported exam.payload has too many keys; maximum is 100.",
            payload["internalError"],
        )
        self.assertEqual(
            "Imported exam.payload could not be enumerated safely.",
            payload["externalError"],
        )

    def test_import_snapshot_accepts_schema_maximum_question_cardinalities(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
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
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));

            const limits = window.ExamApp.EXAM_LIMITS;
            const questions = Array.from({ length: limits.maxQuestions }, (_, questionIndex) => ({
              id: `q${questionIndex}`,
              question: 'Q?',
              question_type: 'MULTI',
              options: Array.from({ length: limits.maxOptions }, (_, optionIndex) => `o${optionIndex}`),
              correct: Array.from({ length: limits.maxCorrectAnswers }, (_, answerIndex) => answerIndex),
              question_images: Array.from(
                { length: limits.maxQuestionImageRefs },
                (_, imageIndex) => ({ filename: `i${imageIndex}.png` })
              ),
              references: Array.from(
                { length: limits.maxQuestionReferences },
                (_, referenceIndex) => `r${referenceIndex}`
              )
            }));
            const snapshot = window.ExamApp.examManager.snapshotImportedJson({ questions, labs: [] });
            const validation = snapshot.valid
              ? window.ExamApp.validateExamData(
                  snapshot.value.questions,
                  null,
                  snapshot.value.labs
                )
              : { valid: false, errors: [snapshot.error] };

            console.log(JSON.stringify({
              snapshotValid: snapshot.valid,
              validationValid: validation.valid,
              errors: validation.errors.slice(0, 3)
            }));
            """
        )

        self.assertTrue(payload["snapshotValid"], payload["errors"])
        self.assertTrue(payload["validationValid"], payload["errors"])

    def test_json_proto_keys_remain_inert_own_data_properties(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/' },
              userExams: {}
            };
            global.document = {
              createElement() { return { appendChild() {}, innerHTML: '' }; },
              createTextNode(value) { return { value }; }
            };
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));
            vm.runInThisContext(fs.readFileSync('assets/js/exam-manager.js', 'utf8'));

            const parsedMetadata = JSON.parse(
              '{"__proto__":{"polluted":"metadata"},"name":"Exam"}'
            );
            const sanitized = window.ExamApp.sanitizeExamMetadata(parsedMetadata, {
              allowCommercial: true
            });
            const parsedQuestion = JSON.parse(
              '{"__proto__":{"module":"spoofed"},"id":"q1","question":"Q?",'
              + '"options":["A","B"],"correct":0}'
            );
            const snapshot = window.ExamApp.examManager.snapshotImportedJson({
              questions: [parsedQuestion],
              labs: []
            });
            const question = snapshot.valid ? snapshot.value.questions[0] : null;

            console.log(JSON.stringify({
              snapshotValid: snapshot.valid,
              snapshotError: snapshot.error,
              sanitizedOwnProto: Object.prototype.hasOwnProperty.call(sanitized, '__proto__'),
              sanitizedPrototypeIntact: Object.getPrototypeOf(sanitized) === Object.prototype,
              sanitizedInheritedPollution: sanitized.polluted,
              snapshotOwnProto: question
                ? Object.prototype.hasOwnProperty.call(question, '__proto__')
                : false,
              snapshotPrototypeIntact: question
                ? Object.getPrototypeOf(question) === Object.prototype
                : false,
              snapshotInheritedModule: question?.module
            }));
            """
        )

        self.assertTrue(payload["snapshotValid"], payload["snapshotError"])
        self.assertTrue(payload["sanitizedOwnProto"])
        self.assertTrue(payload["sanitizedPrototypeIntact"])
        self.assertNotIn("sanitizedInheritedPollution", payload)
        self.assertTrue(payload["snapshotOwnProto"])
        self.assertTrue(payload["snapshotPrototypeIntact"])
        self.assertNotIn("snapshotInheritedModule", payload)

    def test_noncommercial_metadata_cannot_retain_or_trigger_preview_state(self):
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const commercialFields = {
              preview: true,
              commercialStatus: 'pro-preview',
              pro: { url: 'https://example.invalid/buy' },
              recommendedPro: { url: 'https://example.invalid/next' }
            };
            const partial = window.ExamApp.sanitizeExamMetadata({
              name: 'Stored local pack',
              ...commercialFields
            }, { allowCommercial: false });
            const complete = window.ExamApp.sanitizeExamMetadata({
              name: 'Imported taxonomy pack',
              vendor: 'Vendor',
              certificationCode: 'CERT-100',
              domains: ['Cloud'],
              level: 'Associate',
              productFamily: 'Platform',
              contentType: 'practice-exam',
              ...commercialFields
            }, { allowCommercial: false });
            const names = object => Object.keys(object).sort();

            console.log(JSON.stringify({
              partial,
              partialKeys: names(partial),
              partialValid: window.ExamApp.validateExamMetadata(partial, 1, []).valid,
              complete,
              completeKeys: names(complete),
              completeValid: window.ExamApp.validateExamMetadata(complete, 1, []).valid
            }));
            """
        )

        for variant in ("partial", "complete"):
            with self.subTest(variant=variant):
                self.assertNotIn("preview", payload[f"{variant}Keys"])
                self.assertNotIn("pro", payload[f"{variant}Keys"])
                self.assertNotIn("recommendedPro", payload[f"{variant}Keys"])
                self.assertTrue(payload[f"{variant}Valid"])
        self.assertNotIn("commercialStatus", payload["partialKeys"])
        self.assertEqual("free", payload["complete"]["commercialStatus"])

    def test_homepage_caps_bypassed_taxonomy_and_search_rendering(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            function element(tagName) {
              return {
                tagName,
                children: [],
                className: '',
                title: '',
                textContent: '',
                appendChild(child) { this.children.push(child); return child; },
                setAttribute() {}
              };
            }
            global.window = {
              location: {
                hostname: 'localhost',
                search: '',
                href: 'http://localhost/',
                protocol: 'http:'
              }
            };
            global.document = {
              baseURI: 'http://localhost/',
              createElement: element,
              createTextNode(value) { return { value }; },
              getElementById() { return null; },
              querySelector() { return null; },
              querySelectorAll() { return []; },
              addEventListener() {}
            };
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            const homepageSource = `${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`;
            vm.runInThisContext(homepageSource);
            const homepageUnderTest = Object.create(window.HomePageForTest.prototype);
            const throwsOnString = { toString() { throw new Error('unsafe conversion'); } };
            const metadata = {
              vendor: `\ud800${'v'.repeat(500)}`,
              certificationCode: 'c'.repeat(500),
              domains: [throwsOnString, ...Array.from({ length: 30 }, (_, index) => `\ud800domain-${index}-${'d'.repeat(500)}`)],
              level: 'l'.repeat(500),
              productFamily: 'p'.repeat(500),
              contentType: 't'.repeat(500),
              commercialStatus: 'free',
              name: throwsOnString,
              fullName: 'n'.repeat(7000),
              description: 'z'.repeat(7000),
              badge: 'b'.repeat(7000),
              modules: Array(1000).fill('m'.repeat(7000)),
              resources: Array.from({ length: 1000 }, () => ({
                name: 'r'.repeat(7000),
                url: 'u'.repeat(7000)
              }))
            };
            const examData = { source: 'bundled', trust: 'bundled', metadata };
            const wellFormed = value => {
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
            };

            try {
              const taxonomy = homepageUnderTest.getExamTaxonomy('metadata-test', examData);
              const search = homepageUnderTest.getExamSearchText('metadata-test', examData);
              const rendered = homepageUnderTest.createExamTaxonomy('metadata-test', examData, { variant: 'details' });
              const scalarValues = [
                taxonomy.vendor,
                taxonomy.certificationCode,
                taxonomy.level,
                taxonomy.productFamily,
                taxonomy.contentType,
                taxonomy.status,
                ...taxonomy.domains
              ];
              console.log(JSON.stringify({
                threw: false,
                domainCount: taxonomy.domains.length,
                maxScalarLength: Math.max(...scalarValues.map(value => value.length)),
                allWellFormed: scalarValues.every(wellFormed) && wellFormed(search),
                searchLength: search.length,
                renderedChipCount: rendered.children.length,
                moduleCount: homepageUnderTest.getModuleNames(metadata.modules).length
              }));
            } catch (error) {
              console.log(JSON.stringify({ threw: true, message: error.message }));
            }
            """,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertFalse(payload["threw"], payload)
        self.assertLessEqual(payload["domainCount"], 20)
        self.assertLessEqual(payload["maxScalarLength"], 200)
        self.assertTrue(payload["allWellFormed"])
        self.assertLessEqual(payload["searchLength"], 5000)
        self.assertLessEqual(payload["renderedChipCount"], 10)
        self.assertLessEqual(payload["moduleCount"], 100)

    def test_homepage_taxonomy_and_search_flows_use_inert_metadata_snapshots(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {
              location: {
                hostname: 'localhost',
                search: '',
                href: 'http://localhost/',
                protocol: 'http:'
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
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            vm.runInThisContext(
              `${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`
            );

            let fieldGetterHits = 0;
            let rootGetterHits = 0;
            const accessorMetadata = {};
            [
              'domains', 'name', 'fullName', 'description', 'badge', 'vendor',
              'certificationCode', 'level', 'productFamily', 'contentType',
              'commercialStatus', 'preview', 'pro', 'modules', 'resources'
            ].forEach(field => {
              Object.defineProperty(accessorMetadata, field, {
                enumerable: true,
                get() {
                  fieldGetterHits++;
                  throw new Error(`${field} getter executed`);
                }
              });
            });
            const rootAccessorExam = { source: 'bundled', trust: 'bundled' };
            Object.defineProperty(rootAccessorExam, 'metadata', {
              enumerable: true,
              get() {
                rootGetterHits++;
                throw new Error('metadata getter executed');
              }
            });
            const revoked = Proxy.revocable({ name: 'revoked' }, {});
            revoked.revoke();
            const exams = new Map([
              ['field-getter', {
                source: 'bundled',
                trust: 'bundled',
                metadata: accessorMetadata
              }],
              ['root-getter', rootAccessorExam],
              ['revoked', {
                source: 'bundled',
                trust: 'bundled',
                metadata: revoked.proxy
              }]
            ]);
            const homepageUnderTest = Object.create(window.HomePageForTest.prototype);
            homepageUnderTest.availableExams = exams;
            homepageUnderTest.setSelectOptions = () => {};
            homepageUnderTest.libraryVendorFilter = {};
            homepageUnderTest.libraryDomainFilter = {};
            homepageUnderTest.libraryLevelFilter = {};
            homepageUnderTest.libraryStatusFilter = {};

            const matches = {};
            let message = '';
            try {
              homepageUnderTest.renderLibraryFilterOptions(exams);
              for (const examId of exams.keys()) {
                homepageUnderTest.libraryState = {
                  query: examId,
                  vendor: '',
                  domain: '',
                  level: '',
                  status: '',
                  sort: 'recommended'
                };
                matches[examId] = Array.from(homepageUnderTest.getFilteredSortedExams().keys());
              }
            } catch (error) {
              message = error.message || String(error);
            }
            console.log(JSON.stringify({
              message,
              fieldGetterHits,
              rootGetterHits,
              matches
            }));
            """,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertEqual("", payload["message"], payload)
        self.assertEqual(0, payload["fieldGetterHits"])
        self.assertEqual(0, payload["rootGetterHits"])
        self.assertEqual(["field-getter"], payload["matches"]["field-getter"])
        self.assertEqual(["root-getter"], payload["matches"]["root-getter"])
        self.assertEqual(["revoked"], payload["matches"]["revoked"])

    def test_homepage_scalar_paths_never_execute_metadata_or_conversion_hooks(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const elements = new Map();
            function classList() {
              const values = new Set();
              return {
                add(...names) { names.forEach(name => values.add(name)); },
                remove(...names) { names.forEach(name => values.delete(name)); },
                contains(name) { return values.has(name); },
                toggle(name, force) {
                  const enabled = force === undefined ? !values.has(name) : Boolean(force);
                  if (enabled) values.add(name); else values.delete(name);
                  return enabled;
                }
              };
            }
            function element(tagName = 'div') {
              let text = '';
              const node = {
                tagName,
                children: [],
                dataset: {},
                style: {},
                className: '',
                classList: classList(),
                attributes: {},
                parentNode: { insertBefore() {} },
                appendChild(child) { this.children.push(child); return child; },
                replaceChildren(...children) { this.children = children; },
                setAttribute(name, value) { this.attributes[name] = String(value); },
                removeAttribute(name) { delete this.attributes[name]; },
                addEventListener() {},
                querySelector() { return null; },
                querySelectorAll() { return []; },
                closest() { return null; },
                scrollIntoView() {},
                remove() {}
              };
              Object.defineProperty(node, 'textContent', {
                get() { return text; },
                set(value) { text = String(value); }
              });
              return node;
            }
            const byId = id => {
              if (!elements.has(id)) elements.set(id, element());
              return elements.get(id);
            };
            global.window = {
              location: {
                hostname: 'localhost', search: '', href: 'http://localhost/', protocol: 'http:'
              },
              userExams: {},
              addEventListener() {},
              showCustomAlert() {}
            };
            global.document = {
              baseURI: 'http://localhost/',
              body: element('body'),
              activeElement: null,
              createElement: element,
              createTextNode(value) { return { text: String(value) }; },
              createDocumentFragment() { return element('fragment'); },
              getElementById: byId,
              querySelector() { return null; },
              querySelectorAll() { return []; },
              addEventListener() {}
            };
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            global.setTimeout = () => 0;
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            vm.runInThisContext(
              `${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`
            );

            let scalarGetterHits = 0;
            let rootGetterHits = 0;
            let examFieldGetterHits = 0;
            let conversionHits = 0;
            const accessorMetadata = {};
            [
              'name', 'fullName', 'description', 'badge', 'icon', 'duration',
              'questionCount', 'totalQuestions', 'passScore', 'labCount',
              'preview', 'pro', 'recommendedPro', 'modules', 'resources'
            ].forEach(field => {
              Object.defineProperty(accessorMetadata, field, {
                enumerable: true,
                get() {
                  scalarGetterHits++;
                  throw new Error(`${field} getter executed`);
                }
              });
            });
            const conversionValue = {};
            Object.defineProperty(conversionValue, 'toString', {
              get() {
                conversionHits++;
                throw new Error('toString getter executed');
              }
            });
            conversionValue[Symbol.toPrimitive] = () => {
              conversionHits++;
              throw new Error('toPrimitive executed');
            };
            const scalarExam = {
              metadata: accessorMetadata,
              questions: [],
              source: 'bundled',
              trust: 'bundled',
              hasImages: false
            };
            const objectExam = {
              metadata: {
                name: conversionValue,
                fullName: conversionValue,
                icon: conversionValue,
                duration: conversionValue,
                questionCount: conversionValue,
                totalQuestions: conversionValue,
                passScore: conversionValue,
                labCount: conversionValue
              },
              questions: [],
              source: 'bundled',
              trust: 'bundled',
              hasImages: false
            };
            const rootExam = { questions: [], source: 'bundled', trust: 'bundled' };
            Object.defineProperty(rootExam, 'metadata', {
              enumerable: true,
              get() {
                rootGetterHits++;
                throw new Error('metadata getter executed');
              }
            });
            const revoked = Proxy.revocable({ name: 'revoked' }, {});
            revoked.revoke();
            const revokedExam = {
              metadata: revoked.proxy,
              questions: [],
              source: 'bundled',
              trust: 'bundled',
              hasImages: false
            };
            const hostileExam = {
              metadata: {},
              source: 'bundled',
              trust: 'bundled'
            };
            ['questions', 'hasImages'].forEach(field => {
              Object.defineProperty(hostileExam, field, {
                enumerable: true,
                get() {
                  examFieldGetterHits++;
                  throw new Error(`${field} getter executed`);
                }
              });
            });
            const revokedRoot = Proxy.revocable({
              metadata: {},
              questions: [],
              source: 'bundled',
              trust: 'bundled',
              hasImages: false
            }, {});
            revokedRoot.revoke();
            window.userExams = {
              scalar: scalarExam,
              object: objectExam,
              root: rootExam,
              revoked: revokedExam,
              hostile: hostileExam,
              revokedRoot: revokedRoot.proxy
            };
            window.ExamApp.ensureExamLoaded = async id => window.userExams[id];
            window.examSimulator = { currentExam: null, examData: {} };

            const homepageUnderTest = Object.create(window.HomePageForTest.prototype);
            homepageUnderTest.availableExams = new Map(Object.entries(window.userExams));
            homepageUnderTest.libraryState = { sort: 'az' };
            homepageUnderTest.getCardClass = () => '';
            homepageUnderTest.createExamTaxonomy = () => element();
            homepageUnderTest.highlightSelectedCard = () => {};
            homepageUnderTest.placeDetailsPanel = () => {};
            homepageUnderTest.getProgressStats = () => null;
            homepageUnderTest.renderDetailsProgress = () => {};
            homepageUnderTest.updateDetailsStudySummary = () => {};
            homepageUnderTest.updateSelectedQuestionsCount = () => {};
            homepageUnderTest.renderModules = () => {};
            homepageUnderTest.renderResources = () => {};
            homepageUnderTest.renderResourceLinks = () => 0;
            homepageUnderTest.getMostRecentExamWithProgress = () => null;
            homepageUnderTest.updatePreviewHighlights = () => {};
            homepageUnderTest.currentExamInfo = element();
            homepageUnderTest.startExamCta = element();
            homepageUnderTest.activeExamsCount = element();
            homepageUnderTest.totalQuestionsCount = element();
            homepageUnderTest.imageSupportFlag = element();
            homepageUnderTest.previewExamName = element();
            homepageUnderTest.previewSubtitle = element();
            homepageUnderTest.previewLastScore = element();
            homepageUnderTest.previewLastDate = element();
            homepageUnderTest.previewBestScore = element();
            homepageUnderTest.previewBestExam = element();
            homepageUnderTest.previewTimeSpent = element();
            homepageUnderTest.previewPassRate = element();
            homepageUnderTest.previewStatusPill = element();
            homepageUnderTest.previewActionLabel = element();
            homepageUnderTest.previewHighlights = element();

            const errors = [];
            const capture = (name, action) => {
              try { action(); } catch (error) { errors.push(`${name}:${error.message}`); }
            };
            (async () => {
              for (const [id, exam] of Object.entries(window.userExams)) {
                capture(`count-${id}`, () => homepageUnderTest.getTotalQuestionCount(exam));
                capture(`card-${id}`, () => homepageUnderTest.createExamCard(id, exam));
              }
              capture('sort', () => homepageUnderTest.compareLibraryEntries(
                ['scalar', scalarExam], ['object', objectExam]
              ));
              capture('hero-stats', () => homepageUnderTest.updateHeroStats(
                new Map(Object.entries(window.userExams))
              ));
              capture('info', () => homepageUnderTest.showExamInfo('scalar'));
              capture('details', () => homepageUnderTest.showExamDetailsPlaceholder('object'));
              capture('info-hostile', () => homepageUnderTest.showExamInfo('hostile'));
              capture('details-hostile', () => homepageUnderTest.showExamDetailsPlaceholder('hostile'));
              capture('count-hostile', () => window.HomePageForTest.prototype
                .updateSelectedQuestionsCount.call(homepageUnderTest, 'hostile'));
              capture('highlight-hostile', () => window.HomePageForTest.prototype
                .updatePreviewHighlights.call(homepageUnderTest, {}, hostileExam));
              capture('info-revoked-root', () => homepageUnderTest.showExamInfo('revokedRoot'));
              capture('details-revoked-root', () => homepageUnderTest.showExamDetailsPlaceholder('revokedRoot'));
              capture('count-revoked-root', () => window.HomePageForTest.prototype
                .updateSelectedQuestionsCount.call(homepageUnderTest, 'revokedRoot'));
              capture('highlight-revoked-root', () => window.HomePageForTest.prototype
                .updatePreviewHighlights.call(homepageUnderTest, {}, revokedRoot.proxy));
              homepageUnderTest.selectedExamId = 'object';
              capture('preview', () => homepageUnderTest.refreshHeroPreview());
              try {
                await homepageUnderTest.selectExam('scalar', { revealDetails: false });
              } catch (error) {
                errors.push(`select:${error.message}`);
              }
              console.log(JSON.stringify({
                errors,
                scalarGetterHits,
                rootGetterHits,
                examFieldGetterHits,
                conversionHits
              }));
            })();
            """,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertEqual([], payload["errors"], payload)
        self.assertEqual(0, payload["scalarGetterHits"])
        self.assertEqual(0, payload["rootGetterHits"])
        self.assertEqual(0, payload["examFieldGetterHits"])
        self.assertEqual(0, payload["conversionHits"])

    def test_homepage_uses_bounded_inert_snapshots_in_actual_module_and_resource_paths(self):
        payload = self.run_node(
            r"""
            const fs = require('fs');
            const vm = require('vm');
            const elements = new Map();
            function fakeClassList() {
              const values = new Set();
              return {
                add(...names) { names.forEach(name => values.add(name)); },
                remove(...names) { names.forEach(name => values.delete(name)); },
                contains(name) { return values.has(name); },
                toggle(name, force) {
                  const enabled = force === undefined ? !values.has(name) : Boolean(force);
                  if (enabled) values.add(name); else values.delete(name);
                  return enabled;
                }
              };
            }
            function element(tagName = 'div') {
              const node = {
                tagName,
                children: [],
                className: '',
                classList: fakeClassList(),
                dataset: {},
                style: {},
                title: '',
                textContent: '',
                parentNode: null,
                appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
                replaceChildren(...children) {
                  this.children = [];
                  children.forEach(child => this.appendChild(child));
                },
                insertBefore(child, before) {
                  child.parentNode = this;
                  const index = this.children.indexOf(before);
                  if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
                  return child;
                },
                setAttribute() {},
                removeAttribute() {},
                addEventListener() {},
                querySelector() { return null; },
                querySelectorAll() { return []; },
                remove() {
                  if (!this.parentNode) return;
                  this.parentNode.children = this.parentNode.children.filter(child => child !== this);
                },
                scrollIntoView() {}
              };
              Object.defineProperty(node, 'innerHTML', {
                get() { return ''; },
                set() { this.children = []; }
              });
              return node;
            }
            const byId = id => {
              if (!elements.has(id)) elements.set(id, element());
              return elements.get(id);
            };
            global.window = {
              location: { hostname: 'localhost', search: '', href: 'http://localhost/', protocol: 'http:' },
              showCustomAlert() {}
            };
            global.document = {
              baseURI: 'http://localhost/',
              createElement: element,
              createTextNode(value) { return { textContent: String(value), parentNode: null }; },
              getElementById: byId,
              querySelector() { return null; },
              querySelectorAll() { return []; },
              addEventListener() {}
            };
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
            vm.runInThisContext(`${fs.readFileSync(process.argv[1], 'utf8')}\nwindow.HomePageForTest = HomePage;`);

            let indexedGetterHits = 0;
            let itemGetterHits = 0;
            let metadataGetterHits = 0;
            const revokedModule = Proxy.revocable({ name: 'revoked' }, {});
            revokedModule.revoke();
            const revokedResource = Proxy.revocable({ name: 'revoked', url: 'https://learn.microsoft.com/' }, {});
            revokedResource.revoke();
            const modules = Array.from({ length: 150 }, (_, index) => ({
              name: `Module ${index} ${'m'.repeat(6000)}`,
              icon: 'fas fa-book'
            }));
            Object.defineProperty(modules, '1', {
              enumerable: true,
              configurable: true,
              get() { indexedGetterHits++; throw new Error('module index getter'); }
            });
            modules[2] = revokedModule.proxy;
            modules[3] = {};
            Object.defineProperty(modules[3], 'name', {
              enumerable: true,
              get() { itemGetterHits++; throw new Error('module name getter'); }
            });

            const resources = Array.from({ length: 150 }, (_, index) => ({
              name: `Resource ${index} ${'r'.repeat(6000)}`,
              url: `https://learn.microsoft.com/resource-${index}`,
              icon: 'fas fa-link'
            }));
            Object.defineProperty(resources, '1', {
              enumerable: true,
              configurable: true,
              get() { indexedGetterHits++; throw new Error('resource index getter'); }
            });
            resources[2] = revokedResource.proxy;
            resources[3] = { url: 'https://learn.microsoft.com/getter' };
            Object.defineProperty(resources[3], 'name', {
              enumerable: true,
              get() { itemGetterHits++; throw new Error('resource name getter'); }
            });

            const metadata = {
              name: 'Hostile metadata',
              fullName: 'Hostile metadata pack',
              duration: 45,
              questionCount: 1,
              totalQuestions: 1,
              passScore: 70,
              modules,
              resources
            };
            const examData = {
              source: 'bundled',
              trust: 'bundled',
              metadata,
              questions: [{ module: 'Module 0' }],
              hasImages: false
            };
            window.userExams = { hostile: examData };
            window.ExamApp.ensureExamLoaded = async () => examData;
            window.examSimulator = { currentExam: null, examData: {} };

            const homepageUnderTest = Object.create(window.HomePageForTest.prototype);
            homepageUnderTest.selectedExamId = 'hostile';
            homepageUnderTest.modulesSection = element('section');
            homepageUnderTest.modulesList = element('ul');
            homepageUnderTest.resourcesList = element('div');
            homepageUnderTest.currentExamInfo = element();
            homepageUnderTest.startExamCta = element();
            homepageUnderTest.placeDetailsPanel = () => {};
            homepageUnderTest.getProgressStats = () => null;
            homepageUnderTest.renderDetailsProgress = () => {};
            homepageUnderTest.updateDetailsStudySummary = () => {};
            homepageUnderTest.updateSelectedQuestionsCount = () => {};
            homepageUnderTest.refreshHeroPreview = () => {};

            const detailsModulesList = byId('details-modules-list');
            element().appendChild(detailsModulesList);
            byId('details-modules-section').querySelector = () => null;

            const getterMetadata = { name: 'Getter pack', questionCount: 1 };
            Object.defineProperty(getterMetadata, 'modules', {
              enumerable: true,
              get() { metadataGetterHits++; throw new Error('metadata modules getter'); }
            });
            Object.defineProperty(getterMetadata, 'resources', {
              enumerable: true,
              get() { metadataGetterHits++; throw new Error('metadata resources getter'); }
            });

            (async () => {
              try {
                homepageUnderTest.renderModules(modules);
                const directModuleCount = homepageUnderTest.modulesList.children.length;
                const directResources = element();
                const directResourceCount = homepageUnderTest.renderResourceLinks(
                  directResources,
                  resources,
                  examData,
                  'none'
                );
                await homepageUnderTest.selectExam('hostile', { revealDetails: false });
                homepageUnderTest.showExamDetailsPlaceholder('hostile');
                homepageUnderTest.showExamInfo('hostile');
                window.userExams.getter = { metadata: getterMetadata, questions: [] };
                homepageUnderTest.showExamInfo('getter');

                const revokedArray = Proxy.revocable([], {});
                revokedArray.revoke();
                homepageUnderTest.renderModules(revokedArray.proxy);
                const revokedResources = element();
                const revokedResourceCount = homepageUnderTest.renderResourceLinks(
                  revokedResources,
                  revokedArray.proxy,
                  examData,
                  'none'
                );

                const simulatorInfo = window.examSimulator.examData.hostile;
                const originalSnapshotName = simulatorInfo.modules[0].name;
                modules[0].name = 'mutated source';
                console.log(JSON.stringify({
                  threw: false,
                  directModuleCount,
                  directResourceCount,
                  detailModuleCount: detailsModulesList.children.length,
                  detailResourceCount: byId('details-resources-list').children.length,
                  simulatorModules: simulatorInfo.modules.length,
                  simulatorResources: simulatorInfo.resources.length,
                  inertCopy: simulatorInfo.modules[0].name === originalSnapshotName,
                  maxSimulatorString: Math.max(
                    ...simulatorInfo.modules.flatMap(item => [item.name.length, item.icon.length]),
                    ...simulatorInfo.resources.flatMap(item => [item.name.length, item.url.length, item.icon.length])
                  ),
                  revokedResourceCount,
                  getterHits: { indexedGetterHits, itemGetterHits, metadataGetterHits }
                }));
              } catch (error) {
                console.log(JSON.stringify({ threw: true, message: error.message }));
              }
            })();
            """,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertFalse(payload["threw"], payload)
        for field in (
            "directModuleCount",
            "directResourceCount",
            "detailModuleCount",
            "detailResourceCount",
            "simulatorModules",
            "simulatorResources",
        ):
            self.assertLessEqual(payload[field], 100, field)
        self.assertGreater(payload["directModuleCount"], 0)
        self.assertGreater(payload["directResourceCount"], 0)
        self.assertTrue(payload["inertCopy"])
        self.assertLessEqual(payload["maxSimulatorString"], 5000)
        self.assertEqual(0, payload["revokedResourceCount"])
        self.assertEqual(
            {"indexedGetterHits": 0, "itemGetterHits": 0, "metadataGetterHits": 0},
            payload["getterHits"],
        )

    def test_pack_format_documents_exact_metadata_limits(self):
        documentation = " ".join(
            (ROOT / "docs" / "Pack-Format.md").read_text(encoding="utf-8").split()
        )
        for expected in (
            "20 entries for taxonomy lists such as `domains`",
            "200 UTF-16 code units for each taxonomy value",
            "5,000 UTF-16 code units for any other metadata string",
            "100 keys per metadata object",
            "200 UTF-16 code units per metadata key",
            "10 levels below the metadata root",
            "5,000 total nodes",
        ):
            with self.subTest(limit=expected):
                self.assertIn(expected, documentation)

    def test_every_indexed_bundled_metadata_passes_cli_and_runtime_budgets(self):
        exams_root = ROOT / "user-content" / "exams"
        exam_ids = json.loads((exams_root / "index.json").read_text(encoding="utf-8"))
        self.assertTrue(exam_ids)

        for exam_id in exam_ids:
            with self.subTest(validator="python", exam=exam_id):
                exam_dir = exams_root / exam_id
                metadata_path = exam_dir / "metadata.json"
                self.assertTrue(metadata_path.is_file(), metadata_path)
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                dump = json.loads((exam_dir / "dump.json").read_text(encoding="utf-8"))
                questions = dump.get("questions") if isinstance(dump, dict) else dump
                validator = VALIDATOR.PackValidator(exams_root)
                validator.validate_metadata(
                    exam_id,
                    metadata,
                    metadata_path,
                    questions,
                )
                self.assertEqual(
                    [],
                    [issue.message for issue in validator.issues],
                    exam_id,
                )

        runtime = self.run_node(
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
            global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
            vm.runInThisContext(fs.readFileSync(process.argv[1], 'utf8'));

            const examsRoot = 'user-content/exams';
            const examIds = JSON.parse(fs.readFileSync(`${examsRoot}/index.json`, 'utf8'));
            const results = examIds.map(examId => {
              const metadata = JSON.parse(
                fs.readFileSync(`${examsRoot}/${examId}/metadata.json`, 'utf8')
              );
              const dump = JSON.parse(fs.readFileSync(`${examsRoot}/${examId}/dump.json`, 'utf8'));
              const questions = Array.isArray(dump) ? dump : dump.questions;
              const labs = Array.isArray(dump) ? undefined : dump.labs;
              const result = window.ExamApp.validateExamMetadata(
                metadata,
                questions.length,
                labs
              );
              return { examId, valid: result.valid, errors: result.errors };
            });
            console.log(JSON.stringify({ examIds, results }));
            """
        )

        self.assertEqual(exam_ids, runtime["examIds"])
        for result in runtime["results"]:
            with self.subTest(validator="runtime", exam=result["examId"]):
                self.assertTrue(result["valid"], result["errors"])


if __name__ == "__main__":
    unittest.main()
