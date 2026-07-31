"""Quota-sensitive regression test for legacy exam mirror rollback."""

import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class LegacySnapshotRollbackTests(unittest.TestCase):
    def test_rollback_clears_partial_values_before_restoring_snapshot(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        script = textwrap.dedent(
            """
            const fs = require('fs');
            const vm = require('vm');
            const source = fs.readFileSync('assets/js/exam-manager.js', 'utf8');
            const start = source.indexOf('restoreLegacyExamSnapshot(snapshot) {');
            const end = source.indexOf(
              '\\n    // Import exam from file/data',
              start
            );
            if (start < 0 || end < 0) throw new Error('rollback method not found');
            const methodSource = source.slice(start, end);

            const values = new Map([
              ['questions', 'q'.repeat(5)],
              ['metadata', 'N'.repeat(20)],
              ['labs', 'l'.repeat(5)]
            ]);
            const quota = 30;
            const total = () => Array.from(values.values()).reduce(
              (sum, value) => sum + value.length,
              0
            );
            const context = {
              localStorage: {
                getItem(key) { return values.has(key) ? values.get(key) : null; },
                removeItem(key) { values.delete(key); },
                setItem(key, value) {
                  const next = String(value);
                  const currentLength = values.get(key)?.length || 0;
                  if (total() - currentLength + next.length > quota) {
                    const error = new Error('quota exceeded');
                    error.name = 'QuotaExceededError';
                    throw error;
                  }
                  values.set(key, next);
                }
              }
            };
            const holder = vm.runInNewContext(`({${methodSource}})`, context);
            const snapshot = [
              { key: 'questions', value: 'Q'.repeat(15) },
              { key: 'metadata', value: 'm'.repeat(5) },
              { key: 'labs', value: 'L'.repeat(5) }
            ];
            const rollbackError = holder.restoreLegacyExamSnapshot(snapshot);
            console.log(JSON.stringify({
              rollbackError: rollbackError?.message || null,
              values: Object.fromEntries(values),
              total: total()
            }));
            """
        )
        result = subprocess.run(
            [node, "-e", script],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=15,
        )
        self.assertEqual(0, result.returncode, result.stdout)
        payload = json.loads(result.stdout)

        self.assertIsNone(payload["rollbackError"])
        self.assertEqual(
            {
                "questions": "Q" * 15,
                "metadata": "m" * 5,
                "labs": "L" * 5,
            },
            payload["values"],
        )
        self.assertEqual(25, payload["total"])


if __name__ == "__main__":
    unittest.main()
