"""Browser schema regression tests for absent labs and advertised lab counts."""

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
        [node, "-e", script],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=15,
    )
    if result.returncode != 0:
        raise AssertionError(result.stdout)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(f"Node returned invalid JSON:\n{result.stdout}") from error


class LabsPresenceValidationTests(unittest.TestCase):
    def test_complete_pack_cannot_advertise_labs_that_are_absent(self):
        script = textwrap.dedent(
            """
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
            vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));

            const questions = [{
              id: 1,
              question: 'Valid question?',
              options: ['Yes', 'No'],
              correct: 0
            }];
            const completePack = window.ExamApp.validateExamData(
              questions,
              { id: 'demo', labCount: 2 },
              undefined
            );
            const noLabsAdvertised = window.ExamApp.validateExamData(
              questions,
              { id: 'demo' },
              undefined
            );
            const metadataOnly = window.ExamApp.validateExamMetadata(
              { id: 'demo', labCount: 2 },
              null,
              undefined
            );
            console.log(JSON.stringify({
              completePack,
              noLabsAdvertised,
              metadataOnly
            }));
            """
        )
        payload = _run_node(script)

        self.assertFalse(payload["completePack"]["valid"])
        self.assertTrue(
            any(
                "labCount must match the number of labs" in error
                for error in payload["completePack"]["errors"]
            ),
            payload["completePack"],
        )
        self.assertTrue(payload["noLabsAdvertised"]["valid"])
        self.assertTrue(payload["metadataOnly"]["valid"])

    def test_runtime_revalidation_passes_loaded_labs_with_metadata(self):
        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            const source = fs.readFileSync('assets/js/script-multi-exam.js', 'utf8');
            function extractMethod(methodName) {
              const match = new RegExp(
                `^\\\\s*(?:async\\\\s+)?${methodName}\\\\s*\\\\(`,
                'm'
              ).exec(source);
              if (!match) throw new Error('runtime loader method not found');
              const start = match.index;
              const openingBrace = source.indexOf('{', start);
              if (openingBrace < 0) throw new Error('runtime loader method not found');

              let depth = 0;
              let quote = null;
              let escaped = false;
              let lineComment = false;
              let blockComment = false;
              for (let index = openingBrace; index < source.length; index += 1) {
                const char = source[index];
                const next = source[index + 1];
                if (lineComment) {
                  if (char === '\\n') lineComment = false;
                  continue;
                }
                if (blockComment) {
                  if (char === '*' && next === '/') {
                    blockComment = false;
                    index += 1;
                  }
                  continue;
                }
                if (quote) {
                  if (escaped) {
                    escaped = false;
                  } else if (char === '\\\\') {
                    escaped = true;
                  } else if (char === quote) {
                    quote = null;
                  }
                  continue;
                }
                if (char === '/' && next === '/') {
                  lineComment = true;
                  index += 1;
                  continue;
                }
                if (char === '/' && next === '*') {
                  blockComment = true;
                  index += 1;
                  continue;
                }
                if (char === "'" || char === '"' || char === '`') {
                  quote = char;
                  continue;
                }
                if (char === '{') depth += 1;
                if (char === '}') {
                  depth -= 1;
                  if (depth === 0) return source.slice(start, index + 1);
                }
              }
              throw new Error('runtime loader method not found');
            }
            const validationMethodSource = extractMethod('validateRuntimeExamData');
            const methodSource = extractMethod('loadExamFromRuntime');
            const validationCalls = [];
            const context = {
              window: {
                ExamApp: {
                  isSafeExamId() { return true; },
                  isBundledTrustedExam() { return true; },
                  validateExamData(questions, metadata, labs) {
                    validationCalls.push({
                      questions: questions.length,
                      labCount: metadata.labCount,
                      labs: Array.isArray(labs) ? labs.length : null
                    });
                    return {
                      valid: (
                        questions.length === 1
                        && metadata.labCount === 1
                        && Array.isArray(labs)
                        && labs.length === 1
                      )
                    };
                  },
                  warn() {}
                },
                userExams: {
                  az104: {
                    questions: [{ id: 1 }],
                    metadata: {
                      name: 'AZ-104',
                      labCount: 1,
                      modules: []
                    },
                    labs: [{ id: 'lab-1' }],
                    source: 'bundled',
                    trust: 'bundled'
                  }
                }
              },
              localStorage: {
                getItem() { return null; }
              }
            };
            const holder = vm.runInNewContext(
              `({${validationMethodSource},${methodSource}})`,
              context
            );
            const simulator = {
              examData: {},
              validateRuntimeExamData: holder.validateRuntimeExamData
            };
            const loaded = holder.loadExamFromRuntime.call(simulator, 'az104');
            console.log(JSON.stringify({
              loaded,
              validationCalls,
              stored: simulator.examData.az104 || null
            }));
            """
        )
        payload = _run_node(script)

        self.assertTrue(payload["loaded"])
        self.assertEqual(
            [{"questions": 1, "labCount": 1, "labs": 1}],
            payload["validationCalls"],
        )
        self.assertEqual("AZ-104", payload["stored"]["name"])


if __name__ == "__main__":
    unittest.main()
