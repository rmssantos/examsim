"""Regression tests for the Phase 1–2 foundations work."""

import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet
except ImportError:
    from node_harness import run_node_snippet


ROOT = Path(__file__).resolve().parents[1]


class TimerManagerTests(unittest.TestCase):
    def test_timer_uses_elapsed_wall_clock_and_ignores_stale_callbacks(self):
        script_path = ROOT / "assets" / "js" / "script-multi-exam.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('class TimerManager');
const end = source.indexOf('function isExamAnswerProvided', start);
if (start < 0 || end < 0) throw new Error('TimerManager not found');

const sandbox = {
  nowMs: 0,
  intervalCallback: null,
  clearCount: 0,
  setInterval(callback) {
    sandbox.intervalCallback = callback;
    return 1;
  },
  clearInterval(timer) {
    if (timer !== 1) throw new Error(`unexpected timer handle: ${timer}`);
    sandbox.clearCount += 1;
  }
};

vm.runInNewContext(
  source.slice(start, end) + `
    const ticks = [];
    let expirations = 0;
    const manager = new TimerManager(() => nowMs);
    manager.start(60, value => ticks.push(value), () => { expirations += 1; });
    const runningCallback = intervalCallback;

    nowMs = 30400;
    runningCallback();
    const afterThirtyPointFourSeconds = manager.getRemainingTime();

    nowMs = 60500;
    runningCallback();
    const afterDeadline = manager.getRemainingTime();
    runningCallback();
    const afterStaleCallback = manager.getRemainingTime();
    const expirationsAfterStaleCallback = expirations;

    const stoppedTicks = [];
    const stoppedManager = new TimerManager(() => nowMs);
    stoppedManager.start(10, value => stoppedTicks.push(value), () => {
      throw new Error('a stopped timer must not expire');
    });
    const stoppedCallback = intervalCallback;
    stoppedManager.stop();
    nowMs += 20000;
    stoppedCallback();

    result = {
      afterThirtyPointFourSeconds,
      afterDeadline,
      afterStaleCallback,
      expirationsAfterStaleCallback,
      ticks,
      stoppedTicks,
      stoppedRemaining: stoppedManager.getRemainingTime(),
      clearCount
    };
  `,
  sandbox
);
console.log(JSON.stringify(sandbox.result));
"""
        payload = run_node_snippet(script_path, node_script)

        self.assertEqual(30, payload["afterThirtyPointFourSeconds"])
        self.assertEqual(0, payload["afterDeadline"])
        self.assertEqual(0, payload["afterStaleCallback"])
        self.assertEqual(1, payload["expirationsAfterStaleCallback"])
        self.assertEqual([30, 0], payload["ticks"])
        self.assertEqual([], payload["stoppedTicks"])
        self.assertEqual(10, payload["stoppedRemaining"])
        self.assertEqual(2, payload["clearCount"])


class SessionConfigTests(unittest.TestCase):
    def test_diagnostic_session_is_fixed_bounded_and_uses_a_safe_duration(self):
        script_path = ROOT / "assets" / "js" / "exam-init.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('function resolveSessionConfig');
const end = source.indexOf('\nfunction closeExamTab', start);
if (start < 0 || end < 0) throw new Error('resolveSessionConfig not found');

const sandbox = {};
vm.runInNewContext(
  source.slice(start, end) + '\n;globalThis.resolveSessionConfig = resolveSessionConfig;',
  sandbox
);

const base = {
  pageMode: 'exam',
  requestedSession: null,
  requestedCount: null,
  availableQuestionCount: 150,
  normalQuestionCount: 50,
  normalDuration: 45,
  sourceQuestionCount: 50,
  sourceDuration: 45
};
const resolve = (overrides = {}) => sandbox.resolveSessionConfig({ ...base, ...overrides });

const result = {
  full: resolve(),
  countWithoutSession: resolve({ requestedCount: '3' }),
  nonDiagnosticSessions: ['full', 'anything'].map(
    requestedSession => resolve({ requestedSession, requestedCount: '10' })
  ),
  normalizedDiagnosticSessions: ['Diagnostic', ' diagnostic '].map(
    requestedSession => resolve({ requestedSession, requestedCount: '3' })
  ),
  diagnosticCounts: [undefined, '3', '999', 'abc'].map(
    requestedCount => resolve({ requestedSession: 'diagnostic', requestedCount })
  ),
  smallPool: resolve({
    requestedSession: 'diagnostic',
    availableQuestionCount: 3
  }),
  emptyPool: resolve({
    requestedSession: 'diagnostic',
    availableQuestionCount: 0
  }),
  safeFallback: resolve({
    requestedSession: 'diagnostic',
    availableQuestionCount: 2,
    normalQuestionCount: 0,
    normalDuration: 0,
    sourceQuestionCount: 0,
    sourceDuration: 'invalid'
  }),
  studyWins: resolve({
    pageMode: 'study',
    requestedSession: 'diagnostic',
    requestedCount: '3',
    availableQuestionCount: 20,
    normalQuestionCount: 17,
    normalDuration: 14
  })
};
console.log(JSON.stringify(result));
"""
        payload = run_node_snippet(script_path, node_script)

        full = {"sessionType": "full", "questionCount": 50, "duration": 45}
        self.assertEqual(full, payload["full"])
        self.assertEqual(full, payload["countWithoutSession"])
        self.assertEqual([full, full], payload["nonDiagnosticSessions"])
        self.assertEqual(
            [
                {"sessionType": "diagnostic", "questionCount": 10, "duration": 9}
            ]
            * 2,
            payload["normalizedDiagnosticSessions"],
        )
        self.assertEqual(
            [
                {"sessionType": "diagnostic", "questionCount": 10, "duration": 9}
            ]
            * 4,
            payload["diagnosticCounts"],
        )
        self.assertEqual(
            {"sessionType": "diagnostic", "questionCount": 3, "duration": 5},
            payload["smallPool"],
        )
        self.assertEqual(
            {"sessionType": "diagnostic", "questionCount": 0, "duration": 5},
            payload["emptyPool"],
        )
        self.assertEqual(
            {"sessionType": "diagnostic", "questionCount": 2, "duration": 5},
            payload["safeFallback"],
        )
        self.assertEqual(
            {"sessionType": "study", "questionCount": 17, "duration": 14},
            payload["studyWins"],
        )


class RouterTests(unittest.TestCase):
    def test_localhost_requires_an_active_service_worker_for_clean_routes(self):
        script_path = ROOT / "assets" / "js" / "router.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const sandbox = {
  window: {
    ExamApp: {},
    location: {
      protocol: 'http:',
      hostname: 'localhost',
      pathname: '/examplar/index.html'
    }
  },
  navigator: { serviceWorker: {} },
  document: {
    readyState: 'complete',
    querySelectorAll() { return []; }
  },
  URLSearchParams
};

vm.runInNewContext(source, sandbox);
const router = sandbox.window.ExamApp.router;
const homeWithoutController = router.buildUrl('home', { utm_source: 'labs' });
sandbox.window.location.pathname = '/examplar/labs.html';
const labsHomeWithoutController = router.buildUrl('home');
sandbox.window.location.pathname = '/examplar/index.html';
const withoutController = router.buildUrl('roadmaps');
sandbox.navigator.serviceWorker.controller = {};
const withController = router.buildUrl('roadmaps');
sandbox.window.location.protocol = 'file:';
const fileHome = router.buildUrl('home');

console.log(JSON.stringify({ homeWithoutController, labsHomeWithoutController, withoutController, withController, fileHome }));
"""
        payload = run_node_snippet(script_path, node_script)

        self.assertEqual("/examplar/?utm_source=labs", payload["homeWithoutController"])
        self.assertEqual("/examplar/", payload["labsHomeWithoutController"])
        self.assertEqual("roadmaps.html", payload["withoutController"])
        self.assertEqual("/examplar/roadmaps", payload["withController"])
        self.assertEqual("index.html", payload["fileHome"])


if __name__ == "__main__":
    unittest.main()
