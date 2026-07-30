"""Browser schema regression tests for absent labs and advertised lab counts."""

import json
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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
        result = subprocess.run(
            ["node", "-e", script],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=15,
        )
        self.assertEqual(0, result.returncode, result.stdout)
        payload = json.loads(result.stdout)

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
            const start = source.indexOf('loadExamFromRuntime(examId) {');
            const end = source.indexOf('\\n    _completeExamSelection', start);
            if (start < 0 || end < 0) throw new Error('runtime loader method not found');
            const methodSource = source.slice(start, end);
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
            const holder = vm.runInNewContext(`({${methodSource}})`, context);
            const simulator = { examData: {} };
            const loaded = holder.loadExamFromRuntime.call(simulator, 'az104');
            console.log(JSON.stringify({
              loaded,
              validationCalls,
              stored: simulator.examData.az104 || null
            }));
            """
        )
        result = subprocess.run(
            ["node", "-e", script],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=15,
        )
        self.assertEqual(0, result.returncode, result.stdout)
        payload = json.loads(result.stdout)

        self.assertTrue(payload["loaded"])
        self.assertEqual(
            [{"questions": 1, "labCount": 1, "labs": 1}],
            payload["validationCalls"],
        )
        self.assertEqual("AZ-104", payload["stored"]["name"])


if __name__ == "__main__":
    unittest.main()
