"""Behavioral regressions for versioned Study storage keys and migration."""

import textwrap
import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet
except ImportError:
    from node_harness import run_node_snippet


ROOT = Path(__file__).resolve().parents[1]


class StudyStorageKeyMigrationTests(unittest.TestCase):
    def run_node(self, script: str):
        return run_node_snippet(
            ROOT / "assets" / "js" / "study-storage.js",
            textwrap.dedent(script),
            timeout=30,
        )

    def test_v2_keys_are_unique_while_the_legacy_builder_stays_exact(self):
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
            const storage = window.ExamApp.studyStorage;

            const first = 'a'.repeat(80) + '001pf8';
            const second = 'a'.repeat(80) + '00irj6';

            function legacyHash(value) {
              let hash = 2166136261;
              for (let index = 0; index < value.length; index++) {
                hash ^= value.charCodeAt(index);
                hash = Math.imul(hash, 16777619);
              }
              return (hash >>> 0).toString(16).padStart(8, '0');
            }
            function expectedLegacyKey(examId, questionId) {
              const normalized = String(questionId ?? '').trim().replace(/\s+/g, ' ');
              return `studyStats_${examId}_${legacyHash(normalized)}_${encodeURIComponent(normalized).slice(0, 80)}`;
            }
            function callLegacy(examId, questionId) {
              return typeof storage.buildLegacyKey === 'function'
                ? storage.buildLegacyKey(examId, questionId)
                : null;
            }

            console.log(JSON.stringify({
              expectedLegacyFirst: expectedLegacyKey('az900', first),
              expectedLegacySecond: expectedLegacyKey('az900', second),
              actualLegacyFirst: callLegacy('az900', first),
              actualLegacySecond: callLegacy('az900', second),
              v2First: storage.buildKey('az900', first),
              v2Second: storage.buildKey('az900', second),
              separatorLeft: storage.buildKey('a_b', 'c'),
              separatorRight: storage.buildKey('a', 'b_c')
            }));
            """
        )

        self.assertEqual(
            payload["expectedLegacyFirst"],
            payload["expectedLegacySecond"],
            "the regression pair must exercise a real legacy collision",
        )
        self.assertEqual(payload["expectedLegacyFirst"], payload["actualLegacyFirst"])
        self.assertEqual(payload["expectedLegacySecond"], payload["actualLegacySecond"])
        self.assertTrue(payload["v2First"].startswith("studyStats:v2:"))
        self.assertNotEqual(payload["v2First"], payload["v2Second"])
        self.assertNotEqual(payload["separatorLeft"], payload["separatorRight"])

    def test_legacy_records_fall_back_and_migrate_without_crossing_collisions(self):
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
            const storage = window.ExamApp.studyStorage;

            function clone(value) {
              return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
            }

            function memoryDb(records, failure = {}) {
              return {
                transaction(_stores, mode) {
                  let pending = 0;
                  let completionQueued = false;
                  let failed = false;
                  const isReadWrite = mode === 'readwrite';
                  const stagedRecords = isReadWrite
                    ? new Map(Array.from(records, ([key, value]) => [key, clone(value)]))
                    : records;
                  const transaction = {
                    error: null,
                    oncomplete: null,
                    onerror: null,
                    onabort: null
                  };

                  function scheduleCompletion() {
                    if (failed || pending !== 0 || completionQueued) return;
                    completionQueued = true;
                    queueMicrotask(() => {
                      completionQueued = false;
                      if (!failed && pending === 0) {
                        if (isReadWrite) {
                          records.clear();
                          stagedRecords.forEach((value, key) => records.set(key, clone(value)));
                        }
                        if (transaction.oncomplete) transaction.oncomplete();
                      }
                    });
                  }

                  function request(operation, operationName, key) {
                    pending++;
                    const result = {
                      result: undefined,
                      error: null,
                      onsuccess: null,
                      onerror: null
                    };
                    queueMicrotask(() => {
                      try {
                        if (failed) return;
                        if (failure[operationName] === key || failure[operationName] === true) {
                          throw new Error(`Injected ${operationName} failure for ${key}`);
                        }
                        result.result = operation();
                        if (result.onsuccess) result.onsuccess({ target: result });
                      } catch (error) {
                        failed = true;
                        result.error = error;
                        transaction.error = error;
                        if (result.onerror) result.onerror({ target: result });
                        if (transaction.onerror) transaction.onerror({ target: transaction });
                        if (transaction.onabort) transaction.onabort({ target: transaction });
                      } finally {
                        pending--;
                        scheduleCompletion();
                      }
                    });
                    return result;
                  }

                  const store = {
                    get(key) {
                      return request(() => clone(stagedRecords.get(key)), 'get', key);
                    },
                    put(record) {
                      return request(() => {
                        stagedRecords.set(record.key, clone(record));
                        return record.key;
                      }, 'put', record.key);
                    },
                    delete(key) {
                      return request(() => stagedRecords.delete(key), 'delete', key);
                    },
                    index(name) {
                      if (name !== 'examId') throw new Error(`Unexpected index: ${name}`);
                      return {
                        getAll(examId) {
                          return request(() => Array.from(stagedRecords.values())
                            .filter((record) => record.examId === examId)
                            .map(clone), 'getAll', examId);
                        }
                      };
                    }
                  };
                  transaction.objectStore = () => store;
                  queueMicrotask(scheduleCompletion);
                  return transaction;
                }
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
            function legacyKey(examId, questionId) {
              const normalized = String(questionId ?? '').trim().replace(/\s+/g, ' ');
              return `studyStats_${examId}_${legacyHash(normalized)}_${encodeURIComponent(normalized).slice(0, 80)}`;
            }
            function v2Key(examId, questionId) {
              const normalized = String(questionId ?? '').trim().replace(/\s+/g, ' ');
              return `studyStats:v2:${encodeURIComponent(examId)}:${encodeURIComponent(normalized)}`;
            }
            function use(records, failure = {}) {
              const db = memoryDb(records, failure);
              storage.db = db;
              storage.initPromise = Promise.resolve(db);
            }

            (async () => {
              const fallbackRecords = new Map();
              const fallbackLegacyKey = legacyKey('az900', 'legacy-q');
              fallbackRecords.set(fallbackLegacyKey, {
                key: fallbackLegacyKey,
                examId: 'az900',
                questionId: 'legacy-q',
                seenCount: 2,
                correctCount: 1
              });
              use(fallbackRecords);
              const fallback = await storage.getQuestionRecord('az900', 'legacy-q');
              await storage.saveRecord({ ...fallback, seenCount: 3 });
              const migratedKey = v2Key('az900', 'legacy-q');
              const migration = {
                fallbackSeenCount: fallback && fallback.seenCount,
                legacyPresent: fallbackRecords.has(fallbackLegacyKey),
                migratedRecord: clone(fallbackRecords.get(migratedKey))
              };

              const first = 'a'.repeat(80) + '001pf8';
              const second = 'a'.repeat(80) + '00irj6';
              const collisionLegacyKey = legacyKey('az900', first);
              const collisionRecords = new Map([[
                collisionLegacyKey,
                {
                  key: collisionLegacyKey,
                  examId: 'az900',
                  questionId: first,
                  seenCount: 7,
                  correctCount: 4
                }
              ]]);
              use(collisionRecords);
              const mismatchedFallback = await storage.getQuestionRecord('az900', second);
              await storage.saveRecord({
                examId: 'az900',
                questionId: second,
                seenCount: 1,
                correctCount: 1
              });
              const afterMismatchedSave = {
                fallback: mismatchedFallback,
                legacyQuestionId: collisionRecords.get(collisionLegacyKey)?.questionId || null,
                secondV2Present: collisionRecords.has(v2Key('az900', second))
              };
              await storage.saveRecord({
                examId: 'az900',
                questionId: first,
                seenCount: 8,
                correctCount: 5
              });
              const afterMatchingSave = {
                legacyPresent: collisionRecords.has(collisionLegacyKey),
                firstV2Present: collisionRecords.has(v2Key('az900', first))
              };

              async function exerciseFailedMigration(operationName) {
                const examId = `rollback-${operationName}`;
                const rollbackRecords = new Map();
                const rollbackLegacyKey = legacyKey(examId, 'legacy-q');
                const rollbackV2Key = v2Key(examId, 'legacy-q');
                rollbackRecords.set(rollbackLegacyKey, {
                  key: rollbackLegacyKey,
                  examId,
                  questionId: 'legacy-q',
                  seenCount: 4,
                  correctCount: 2
                });
                use(rollbackRecords, { [operationName]: rollbackLegacyKey });
                const saved = await storage.saveRecord({
                  examId,
                  questionId: 'legacy-q',
                  seenCount: 5,
                  correctCount: 3
                });
                return {
                  saved,
                  legacyPresent: rollbackRecords.has(rollbackLegacyKey),
                  legacySeenCount: rollbackRecords.get(rollbackLegacyKey)?.seenCount || null,
                  v2Present: rollbackRecords.has(rollbackV2Key)
                };
              }
              const failedLookupRollback = await exerciseFailedMigration('get');
              const failedDeleteRollback = await exerciseFailedMigration('delete');

              const duplicateRecords = new Map();
              const duplicateLegacyKey = legacyKey('dedupe', 'q1');
              const duplicateV2Key = v2Key('dedupe', 'q1');
              duplicateRecords.set(duplicateLegacyKey, {
                key: duplicateLegacyKey,
                examId: 'dedupe',
                questionId: 'q1',
                seenCount: 2
              });
              duplicateRecords.set(duplicateV2Key, {
                key: duplicateV2Key,
                examId: 'dedupe',
                questionId: 'q1',
                seenCount: 9
              });
              use(duplicateRecords);
              const preferredRead = await storage.getQuestionRecord('dedupe', 'q1');
              const allRecords = await storage.getRecordsForExam('dedupe');

              process.stdout.write(JSON.stringify({
                migration,
                afterMismatchedSave,
                afterMatchingSave,
                failedLookupRollback,
                failedDeleteRollback,
                preferredSeenCount: preferredRead && preferredRead.seenCount,
                allSeenCounts: allRecords.map((record) => record.seenCount)
              }));
            })().catch((error) => {
              process.stderr.write(String(error && error.stack || error));
              process.exit(1);
            });
            """
        )

        self.assertEqual(2, payload["migration"]["fallbackSeenCount"])
        self.assertFalse(payload["migration"]["legacyPresent"])
        self.assertEqual(3, payload["migration"]["migratedRecord"]["seenCount"])

        self.assertIsNone(payload["afterMismatchedSave"]["fallback"])
        self.assertTrue(payload["afterMismatchedSave"]["secondV2Present"])
        self.assertTrue(payload["afterMismatchedSave"]["legacyQuestionId"].endswith("001pf8"))
        self.assertFalse(payload["afterMatchingSave"]["legacyPresent"])
        self.assertTrue(payload["afterMatchingSave"]["firstV2Present"])

        for failure in ("failedLookupRollback", "failedDeleteRollback"):
            with self.subTest(failure=failure):
                self.assertFalse(payload[failure]["saved"])
                self.assertTrue(payload[failure]["legacyPresent"])
                self.assertEqual(4, payload[failure]["legacySeenCount"])
                self.assertFalse(payload[failure]["v2Present"])

        self.assertEqual(9, payload["preferredSeenCount"])
        self.assertEqual([9], payload["allSeenCounts"])


if __name__ == "__main__":
    unittest.main()
