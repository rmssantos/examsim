import json
import shutil
import subprocess
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]


class ConversionFunnelTests(unittest.TestCase):
    def run_activation_events(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);

const sent = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = (_url, options) => {
  sent.push(JSON.parse(options.body)[0]);
  return Promise.resolve();
};
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href: 'https://examplar.app/exams/sc900/',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/exams/sc900/'
  },
  ExamApp: {
    isPublicSiteHost(host = 'examplar.app') {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const analytics = window.ExamApp.analytics;
const malicious = {
  email: 'customer@example.com',
  answer: 'secret answer',
  question_text: 'secret question',
  visitor_id: 'user-123',
  arbitrary: 'must not pass'
};
analytics.trackLandingCtaClicked('sc900', 'diagnostic', malicious);
analytics.trackLandingCtaClicked('sc900', 'javascript:alert(1)', malicious);
analytics.trackSessionConfigured('sc900', {
  sessionType: 'diagnostic',
  questionCount: 10,
  durationMinutes: 5,
  ...malicious
});
analytics.trackExamStarted('sc900', {
  sessionType: 'diagnostic',
  questionCount: 10,
  ...malicious
});
analytics.trackExamFirstAnswered('sc900', {
  sessionType: 'diagnostic',
  ...malicious
});
analytics.trackExamCompleted('sc900', {
  sessionType: 'diagnostic',
  questionCount: 10,
  score: 80,
  passed: true,
  timeSpent: 8,
  ...malicious
});
analytics.trackSessionConfigured('customer@example.com', {
  sessionType: 'malicious',
  questionCount: 1001,
  durationMinutes: 0,
  ...malicious
});

console.log(JSON.stringify(sent.map((envelope) => envelope.data.baseData)));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def run_commercial_events(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);

const sent = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = (_url, options) => {
  sent.push(JSON.parse(options.body)[0]);
  return Promise.resolve();
};
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href: 'https://examplar.app/',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/'
  },
  ExamApp: {
    isPublicSiteHost(host = 'examplar.app') {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const analytics = window.ExamApp.analytics;
const malicious = {
  price: 'EUR 999',
  url: 'https://secret.example/path',
  filename: 'customer@example.com.json',
  email: 'customer@example.com',
  visitor_id: 'user-123'
};
analytics.trackProUnlockClicked('az104', malicious);
analytics.trackProModalOpened('saac03', malicious);
analytics.trackProPurchaseClicked('az104', malicious);
analytics.trackProImportClicked('saac03', malicious);
analytics.trackProResultsCtaClicked('az104', malicious);
analytics.trackPassStoryClicked('az104', malicious);
analytics.trackGithubRepositoryClicked('az104', 'results_end', malicious);
analytics.trackGithubRepositoryClicked('customer@example.com', 'profile', malicious);

console.log(JSON.stringify(sent.map((envelope) => envelope.data.baseData)));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def run_gumroad_decorations(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);

const tab = new Map();
const localData = new Map();
global.localStorage = {
  getItem(key) { return localData.has(key) ? localData.get(key) : null; },
  setItem(key, value) { localData.set(key, String(value)); },
  removeItem(key) { localData.delete(key); }
};
global.sessionStorage = {
  getItem(key) { return tab.has(key) ? tab.get(key) : null; },
  setItem(key, value) { tab.set(key, String(value)); },
  removeItem(key) { tab.delete(key); }
};
global.fetch = () => Promise.resolve();
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href: 'https://examplar.app/?utm_source=Reddit&utm_campaign=launch',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/'
  },
  ExamApp: {
    isPublicSiteHost(host = window.location.hostname) {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const helper = window.ExamApp.analytics?._private?.decorateGumroadUrl;
const available = typeof helper === 'function';
const product = 'https://examplar.gumroad.com/l/az104-complete/EXAMPLAR30';
let reddit = null;
let google = null;
let direct = null;
let rejected = null;
let rejectedGumroadProfile = null;
let rejectedGumroadReceipt = null;
let rejectedOtherGumroadStore = null;
let googleClick = null;
let persistedGoogleClick = null;
let braidClick = null;
let invalidGoogleClick = null;
let embeddedClickId = null;
let storedGoogleClickIds = null;
let clickIdsAfterInvalid = null;
let clickIdTelemetryProperties = null;
let clickIdBoundaryValues = null;
let optedOut = null;
let optOutCleared = false;
let googleClickOptOutCleared = false;
let local = null;
if (available) {
  reddit = helper(product);
  tab.clear();
  window.location.href = 'https://examplar.app/?utm_source=google_ads';
  google = helper(product);
  tab.clear();
  window.location.href = 'https://examplar.app/';
  direct = helper(product);
  rejected = helper('https://evil.example/checkout');
  rejectedGumroadProfile = helper('https://examplar.gumroad.com/profile');
  rejectedGumroadReceipt = helper('https://app.gumroad.com/receipt/example');
  rejectedOtherGumroadStore = helper('https://another-store.gumroad.com/l/example');
  embeddedClickId = helper(`${product}?gclid=Untrusted_Target-Click`);

  tab.clear();
  window.location.href = 'https://examplar.app/exams/ai103/?utm_source=google_ads&gclid=Click_ID-123_ABC';
  googleClick = helper(product);
  storedGoogleClickIds = tab.get('exam_google_ads_click_ids') || null;
  clickIdTelemetryProperties = window.ExamApp.analytics._private
    .buildPageViewEnvelope().data.baseData.properties;
  const sanitizeClickId = window.ExamApp.analytics._private.sanitizeGoogleAdsClickId;
  clickIdBoundaryValues = {
    accepted256: sanitizeClickId('A'.repeat(256)),
    rejected257: sanitizeClickId('A'.repeat(257)),
    rejectedPunctuation: sanitizeClickId('abc/def')
  };
  window.location.href = 'https://examplar.app/roadmaps.html';
  persistedGoogleClick = helper(product);

  tab.clear();
  window.location.href = 'https://examplar.app/exams/ai103/?gbraid=Braid_123-ABC&wbraid=Wbraid_456-DEF';
  braidClick = helper(product);

  tab.clear();
  window.location.href = 'https://examplar.app/exams/ai103/?gclid=https%3A%2F%2Fevil.example%2Fid';
  invalidGoogleClick = helper(product);
  clickIdsAfterInvalid = tab.get('exam_google_ads_click_ids') || null;

  tab.set('exam_analytics_attribution', JSON.stringify({ campaign_source: 'reddit' }));
  tab.set('exam_google_ads_click_ids', JSON.stringify({ gclid: 'Must_Be-Cleared' }));
  localData.set('exam_analytics_opt_out', 'true');
  optedOut = helper(product);
  optOutCleared = !tab.has('exam_analytics_attribution');
  googleClickOptOutCleared = !tab.has('exam_google_ads_click_ids');

  localData.clear();
  tab.clear();
  window.location.href = 'http://localhost:8000/';
  window.location.protocol = 'http:';
  window.location.hostname = 'localhost';
  window.location.pathname = '/';
  local = helper(product);
}
console.log(JSON.stringify({
  available,
  reddit,
  google,
  direct,
  rejected,
  rejectedGumroadProfile,
  rejectedGumroadReceipt,
  rejectedOtherGumroadStore,
  googleClick,
  persistedGoogleClick,
  braidClick,
  invalidGoogleClick,
  embeddedClickId,
  storedGoogleClickIds,
  clickIdsAfterInvalid,
  clickIdTelemetryProperties,
  clickIdBoundaryValues,
  optedOut,
  optOutCleared,
  googleClickOptOutCleared,
  local
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def run_study_events(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);

const sent = [];
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = (_url, options) => {
  sent.push(JSON.parse(options.body)[0]);
  return Promise.resolve();
};
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href: 'https://examplar.app/exams/sc900/',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/exams/sc900/'
  },
  ExamApp: {
    isPublicSiteHost(host = 'examplar.app') {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const analytics = window.ExamApp.analytics;
const malicious = {
  questionId: 'question-secret-42',
  questionText: 'private question text',
  options: ['private option A', 'private option B'],
  selectedResponse: 'private selected response',
  isCorrect: true,
  answerState: 'answered',
  email: 'learner@example.com'
};

analytics.trackStudyStarted('sc900', {
  questionCount: 4,
  dueCount: 2,
  newCount: 1,
  weakCount: 1,
  ...malicious
});
const firstAnswerAvailable = typeof analytics.trackStudyFirstAnswered === 'function';
if (firstAnswerAvailable) {
  analytics.trackStudyFirstAnswered('sc900', malicious);
}
analytics.trackStudyCompleted('sc900', {
  questionCount: 4,
  answeredCount: 3,
  correctCount: 2,
  timeSpent: 7,
  ...malicious
});

console.log(JSON.stringify({
  firstAnswerAvailable,
  events: sent.map((envelope) => envelope.data.baseData)
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def test_commercial_events_have_bounded_names_and_properties(self):
        events = self.run_commercial_events()
        self.assertEqual(
            [event["name"] for event in events],
            [
                "pro_unlock_clicked",
                "pro_modal_opened",
                "pro_purchase_clicked",
                "pro_import_clicked",
                "pro_purchase_clicked",
                "pass_story_clicked",
                "github_repository_clicked",
            ],
        )

        expected_specific = [
            {"exam_id": "az104", "exam_source": "bundled", "placement": "exam_card"},
            {"exam_id": "saac03", "exam_source": "bundled"},
            {"exam_id": "az104", "exam_source": "bundled", "store": "gumroad"},
            {"exam_id": "saac03", "exam_source": "bundled"},
            {
                "exam_id": "az104",
                "exam_source": "bundled",
                "store": "gumroad",
                "placement": "results_pro_upsell",
            },
            {"exam_id": "az104", "exam_source": "bundled", "placement": "results"},
            {"exam_id": "az104", "exam_source": "bundled", "placement": "results_end"},
        ]
        common = {
            "app": "examsim",
            "deployment": "github_pages",
            "page": "home",
            "path": "/",
            "analytics_version": "1.7.0",
        }
        for event, specific in zip(events, expected_specific):
            with self.subTest(event=event["name"]):
                self.assertEqual(event["properties"], {**common, **specific})
                self.assertEqual(event["measurements"], {})

    def test_gumroad_links_keep_discount_and_forward_only_a_coarse_referrer(self):
        payload = self.run_gumroad_decorations()
        self.assertTrue(payload["available"])

        expected = {
            "reddit": "https://www.reddit.com",
            "google": "https://www.google.com",
            "direct": "https://examplar.app",
        }
        for name, referrer in expected.items():
            with self.subTest(name=name):
                parsed = urlparse(payload[name])
                self.assertEqual(parsed.scheme, "https")
                self.assertEqual(parsed.netloc, "examplar.gumroad.com")
                self.assertEqual(parsed.path, "/l/az104-complete/EXAMPLAR30")
                self.assertEqual(parse_qs(parsed.query), {"referrer": [referrer]})

        self.assertIsNone(payload["rejected"])
        self.assertIsNone(payload["rejectedGumroadProfile"])
        self.assertIsNone(payload["rejectedGumroadReceipt"])
        self.assertIsNone(payload["rejectedOtherGumroadStore"])

    def test_gumroad_links_honor_analytics_opt_out(self):
        payload = self.run_gumroad_decorations()
        self.assertIsNone(payload["optedOut"])
        self.assertTrue(payload["optOutCleared"])
        self.assertTrue(payload["googleClickOptOutCleared"])

    def test_google_ads_click_ids_are_forwarded_only_for_the_current_tab(self):
        payload = self.run_gumroad_decorations()

        google = parse_qs(urlparse(payload["googleClick"]).query)
        persisted = parse_qs(urlparse(payload["persistedGoogleClick"]).query)
        braids = parse_qs(urlparse(payload["braidClick"]).query)
        invalid = parse_qs(urlparse(payload["invalidGoogleClick"]).query)

        self.assertEqual(google["gclid"], ["Click_ID-123_ABC"])
        self.assertEqual(persisted["gclid"], ["Click_ID-123_ABC"])
        self.assertEqual(
            json.loads(payload["storedGoogleClickIds"]),
            {"gclid": "Click_ID-123_ABC"},
        )
        self.assertEqual(braids["gbraid"], ["Braid_123-ABC"])
        self.assertEqual(braids["wbraid"], ["Wbraid_456-DEF"])
        self.assertNotIn("gclid", invalid)
        self.assertNotIn(
            "gclid",
            parse_qs(urlparse(payload["embeddedClickId"]).query),
        )
        self.assertIsNone(payload["clickIdsAfterInvalid"])

    def test_google_ads_click_ids_never_enter_product_telemetry(self):
        properties = self.run_gumroad_decorations()["clickIdTelemetryProperties"]

        self.assertNotIn("gclid", properties)
        self.assertNotIn("gbraid", properties)
        self.assertNotIn("wbraid", properties)

    def test_google_ads_click_ids_have_strict_length_and_character_bounds(self):
        boundaries = self.run_gumroad_decorations()["clickIdBoundaryValues"]

        self.assertEqual(boundaries["accepted256"], "A" * 256)
        self.assertEqual(boundaries["rejected257"], "")
        self.assertEqual(boundaries["rejectedPunctuation"], "")

    def test_gumroad_links_are_not_decorated_outside_the_public_site(self):
        payload = self.run_gumroad_decorations()
        self.assertIsNone(payload["local"])

    def test_activation_events_have_bounded_properties_and_measurements(self):
        events = self.run_activation_events()
        self.assertEqual(
            [event["name"] for event in events],
            [
                "landing_cta_clicked",
                "session_configured",
                "exam_started",
                "exam_first_answered",
                "exam_completed",
                "session_configured",
            ],
        )

        common = {
            "app": "examsim",
            "deployment": "github_pages",
            "page": "landing",
            "path": "/exams/sc900/",
            "analytics_version": "1.7.0",
        }
        self.assertEqual(
            events[0]["properties"],
            {
                **common,
                "exam_id": "sc900",
                "exam_source": "bundled",
                "action": "diagnostic",
            },
        )
        self.assertEqual(events[0]["measurements"], {})

        self.assertEqual(
            events[1]["properties"],
            {
                **common,
                "exam_id": "sc900",
                "exam_source": "bundled",
                "session_type": "diagnostic",
            },
        )
        self.assertEqual(
            events[1]["measurements"],
            {"question_count": 10, "duration_minutes": 5},
        )

        self.assertEqual(
            events[2]["properties"],
            {
                **common,
                "exam_id": "sc900",
                "exam_source": "bundled",
                "session_type": "diagnostic",
            },
        )
        self.assertEqual(events[2]["measurements"], {"question_count": 10})

        self.assertEqual(
            events[3]["properties"],
            {
                **common,
                "exam_id": "sc900",
                "exam_source": "bundled",
                "session_type": "diagnostic",
            },
        )
        self.assertEqual(events[3]["measurements"], {})

        self.assertEqual(
            events[4]["properties"],
            {
                **common,
                "exam_id": "sc900",
                "exam_source": "bundled",
                "session_type": "diagnostic",
                "passed": "true",
                "score_bucket": "70-89",
                "duration_bucket": "5-15m",
            },
        )
        self.assertEqual(events[4]["measurements"], {"question_count": 10})

        self.assertEqual(
            events[5]["properties"],
            {
                **common,
                "exam_id": "imported",
                "exam_source": "imported",
                "session_type": "unknown",
            },
        )
        self.assertEqual(events[5]["measurements"], {})

        serialized = json.dumps(events)
        for forbidden in (
            "customer@example.com",
            "secret answer",
            "secret question",
            "visitor_id",
            "arbitrary",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, serialized)

    def test_study_events_minimize_per_answer_telemetry(self):
        payload = self.run_study_events()
        self.assertTrue(payload["firstAnswerAvailable"])

        events = payload["events"]
        self.assertEqual(
            [event["name"] for event in events],
            ["study_started", "study_first_answered", "study_completed"],
        )

        common = {
            "app": "examsim",
            "deployment": "github_pages",
            "page": "landing",
            "path": "/exams/sc900/",
            "analytics_version": "1.7.0",
            "exam_id": "sc900",
            "exam_source": "bundled",
        }
        self.assertEqual(events[0]["properties"], common)
        self.assertEqual(events[0]["measurements"], {})
        self.assertEqual(
            events[1]["properties"],
            {**common, "session_type": "study"},
        )
        self.assertEqual(events[1]["measurements"], {})
        self.assertEqual(
            events[2]["properties"],
            {
                **common,
                "accuracy_bucket": "50-69",
                "duration_bucket": "5-15m",
            },
        )
        self.assertEqual(
            events[2]["measurements"],
            {"question_count": 4, "answered_count": 3, "correct_count": 2},
        )

        serialized = json.dumps(events)
        for forbidden in (
            "question-secret-42",
            "private question text",
            "private option A",
            "private option B",
            "private selected response",
            "learner@example.com",
            "answer_state",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, serialized)

        analytics_source = (ROOT / "assets/js/analytics.js").read_text(encoding="utf-8")
        self.assertNotIn("study_question_answered", analytics_source)
        self.assertNotIn("trackStudyQuestionAnswered", analytics_source)

    def test_first_answer_is_tracked_once_per_runtime_session(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('class MultiExamSimulator');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'");
const classSource = source.slice(start, end);
const tracked = [];
const studyTracked = [];
const started = [];
const studyStarted = [];
const badge = {};
const context = {
  URL,
  URLSearchParams,
  console,
  alert() {},
  document: {
    body: { classList: { add() {}, remove() {} } },
    getElementById(id) {
      if (id === 'current-exam-badge') return badge;
      return null;
    },
    removeEventListener() {},
    querySelectorAll() { return []; }
  },
  window: {
    ExamApp: {
      analytics: {
        trackExamStarted(examId, details) {
          started.push({ examId, details });
        },
        trackStudyStarted(examId, details) {
          studyStarted.push({ examId, details: details ?? null });
        },
        trackExamFirstAnswered(examId, details) {
          tracked.push({ examId, details });
        },
        trackStudyFirstAnswered(examId, details) {
          studyTracked.push({ examId, details: details ?? null });
        }
      }
    }
  }
};
vm.runInNewContext(
  classSource + '\n;globalThis.MultiExamSimulator = MultiExamSimulator;',
  context,
  { filename: 'script-multi-exam.js' }
);

const Simulator = context.MultiExamSimulator;
const sim = Object.create(Simulator.prototype);
Object.assign(sim, {
  currentExam: 'sc900',
  examData: {
    sc900: {
      name: 'SC-900',
      duration: 45,
      questionCount: 1,
      sessionType: 'diagnostic',
      questions: [{ id: 1, question: 'Q', options: ['A', 'B'], correct: 0 }]
    }
  },
  currentQuestionIndex: 0,
  selectedAnswers: {},
  markedForReview: new Set(),
  touchedQuestions: new Set(),
  localIdCounter: 0,
  timerManager: { stop() {} },
  navigator: {},
  studySessionResults: new Map()
});
sim.applyExamModeChrome = () => {};
sim.applyStudyModeChrome = () => {};
sim.sampleBalancedQuestions = (questions) => questions;
sim.randomizeQuestionOptions = (question) => question;
sim.startTimer = () => {};
sim.setupKeyboardShortcuts = () => {};
sim.showQuestion = () => {};
sim.showScreen = () => {};
sim.updateNavigator = () => {};
sim.consumeStudyFocusQuestions = () => null;
sim.getSessionQuestionLimit = () => 1;
sim.isStudyMode = function () { return this.mode === 'study'; };

(async () => {
  sim.startExam();
  sim.handleAnswerChanged();
  sim.handleAnswerChanged();

  sim.examData.sc900.sessionType = 'full';
  sim.startExam();
  sim.handleAnswerChanged();

  delete sim.examData.sc900.sessionType;
  sim.startExam();
  sim.handleAnswerChanged();

  await sim.startStudyMode();
  sim.handleAnswerChanged();
  sim.handleAnswerChanged();

  await sim.startStudyMode();
  sim.handleAnswerChanged();

  console.log(JSON.stringify({ tracked, studyTracked, started, studyStarted }));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/script-multi-exam.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(
            payload["tracked"],
            [
                {"examId": "sc900", "details": {"sessionType": "diagnostic"}},
                {"examId": "sc900", "details": {"sessionType": "full"}},
                {"examId": "sc900", "details": {"sessionType": "full"}},
            ],
        )
        self.assertEqual(
            payload["studyTracked"],
            [
                {"examId": "sc900", "details": None},
                {"examId": "sc900", "details": None},
            ],
        )
        self.assertEqual(
            payload["studyStarted"],
            [
                {"examId": "sc900", "details": None},
                {"examId": "sc900", "details": None},
            ],
        )
        self.assertEqual(
            payload["started"],
            [
                {
                    "examId": "sc900",
                    "details": {"questionCount": 1, "sessionType": "diagnostic"},
                },
                {
                    "examId": "sc900",
                    "details": {"questionCount": 1, "sessionType": "full"},
                },
                {
                    "examId": "sc900",
                    "details": {"questionCount": 1, "sessionType": "full"},
                },
            ],
        )

    def test_runtime_threads_one_resolved_session_type_through_funnel_and_progress(self):
        source = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        sections = {
            "started": source[
                source.index("    startExam()"):
                source.index("    async startStudyMode()")
            ],
            "first_answer": source[
                source.index("    handleAnswerChanged()"):
                source.index("    closeFeedback()")
            ],
            "completed": source[
                source.index("    showResults("):
                source.index("    generateDetailedReview(")
            ],
            "attempt": source[
                source.index("    saveProgress("):
                source.index("    updateProgressDisplay()")
            ],
        }

        self.assertIn("    getSessionType()", source)
        for event, section in sections.items():
            with self.subTest(event=event):
                self.assertIn("sessionType: this.getSessionType()", section)

    def test_diagnostic_attempt_is_saved_without_changing_completion_aggregates(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const utilsSource = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('class MultiExamSimulator');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'");
const classSource = source.slice(start, end);
const records = new Map([
  ['sc900_progress', JSON.stringify({
    attempts: [{ score: 80 }],
    bestScore: 80,
    totalPassed: 1
  })]
]);
const context = {
  URL,
  URLSearchParams,
  console,
  alert() {},
  CustomEvent: class CustomEvent {
    constructor(type) { this.type = type; }
  },
  localStorage: {
    getItem(key) { return records.get(key) ?? null; },
    setItem(key, value) { records.set(key, value); }
  },
  document: {
    addEventListener() {},
    removeEventListener() {},
    createElement() { return { appendChild() {}, innerHTML: '' }; },
    createTextNode(value) { return { value }; }
  },
  window: {
    dispatchEvent() {},
    location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
  }
};
vm.createContext(context);
vm.runInContext(utilsSource, context, { filename: 'utils.js' });
Object.assign(context.window.ExamApp, {
  STORAGE_KEYS: { progress: 'progress' },
  addToRegistry() {}
});
vm.runInContext(
  classSource + '\n;globalThis.MultiExamSimulator = MultiExamSimulator;',
  context,
  { filename: 'script-multi-exam.js' }
);

const Simulator = context.MultiExamSimulator;
const sim = Object.create(Simulator.prototype);
Object.assign(sim, {
  currentExam: 'sc900',
  examData: {
    sc900: {
      sessionType: 'diagnostic',
      selectedModules: null
    }
  },
  mode: 'exam',
  getCurrentQuestions() { return [{ id: 'q1' }]; },
  buildAttemptQuestionResults() {
    return [{
      questionId: 'q1',
      order: 1,
      userAnswer: 0,
      correct: true,
      skipped: false
    }];
  },
  generateLocalId() { return 'attempt_test'; },
  saveProgressToStorage(key, progress) {
    context.localStorage.setItem(key, JSON.stringify(progress));
    return true;
  }
});

const snapshot = () => JSON.parse(context.localStorage.getItem('sc900_progress'));

sim.saveProgress(100, true, 1);
const diagnostic = snapshot();

sim.examData.sc900.sessionType = 'full';
sim.saveProgress(80, true, 2);
const full = snapshot();

sim.mode = 'study';
sim.saveProgress(90, true, 3);
const study = snapshot();

console.log(JSON.stringify({ diagnostic, full, study }));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/script-multi-exam.js"),
                str(ROOT / "assets/js/utils.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(len(payload["diagnostic"]["attempts"]), 2)
        self.assertEqual(payload["diagnostic"]["attempts"][-1]["sessionType"], "diagnostic")
        self.assertNotIn("passed", payload["diagnostic"]["attempts"][0])
        self.assertEqual(payload["diagnostic"]["bestScore"], 80)
        self.assertEqual(payload["diagnostic"]["totalPassed"], 1)
        self.assertEqual(len(payload["full"]["attempts"]), 3)
        self.assertEqual(payload["full"]["bestScore"], 80)
        self.assertEqual(payload["full"]["totalPassed"], 2)
        self.assertEqual(len(payload["study"]["attempts"]), 4)
        self.assertEqual(payload["study"]["bestScore"], 90)
        self.assertEqual(payload["study"]["totalPassed"], 3)

    def test_diagnostic_only_readiness_copy_is_explicit(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('class HomePage');
const end = source.indexOf('// Initialize when page loads');
const classSource = source.slice(start, end);
const context = {};
vm.runInNewContext(
  classSource + '\n;globalThis.HomePage = HomePage;',
  context,
  { filename: 'homepage.js' }
);
const home = Object.create(context.HomePage.prototype);
console.log(JSON.stringify({
  diagnosticHigh: home.getReadinessLabel({
    attempts: 1,
    completionAttempts: 0,
    lastScore: 80,
    bestScore: null,
    passRate: null
  }),
  diagnosticLow: home.getReadinessLabel({
    attempts: 1,
    completionAttempts: 0,
    lastScore: 40,
    bestScore: null,
    passRate: null
  }),
  mixedHigh: home.getReadinessLabel({
    attempts: 2,
    completionAttempts: 1,
    lastScore: 80,
    bestScore: 80,
    passRate: 100
  }),
  mixedLow: home.getReadinessLabel({
    attempts: 2,
    completionAttempts: 1,
    lastScore: 40,
    bestScore: 80,
    passRate: 100
  })
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/homepage.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "diagnosticHigh": "Diagnostic suggests on track",
                "diagnosticLow": "Diagnostic suggests review",
                "mixedHigh": "On track",
                "mixedLow": "Needs work",
            },
        )

    def test_readiness_uses_last_completion_instead_of_later_diagnostic(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const utilsSource = fs.readFileSync(process.argv[2], 'utf8');
const start = source.indexOf('class HomePage');
const end = source.indexOf('// Initialize when page loads');
const classSource = source.slice(start, end);
const progressByKey = new Map([
  ['full_then_diagnostic_progress', JSON.stringify({
    attempts: [
      { score: 90, passed: true, date: '2026-07-28T10:00:00Z', sessionType: 'full' },
      { score: 10, date: '2026-07-29T10:00:00Z', sessionType: 'diagnostic' }
    ]
  })],
  ['diagnostic_then_full_progress', JSON.stringify({
    attempts: [
      { score: 100, date: '2026-07-28T10:00:00Z', sessionType: 'diagnostic' },
      { score: 20, passed: false, date: '2026-07-29T10:00:00Z', sessionType: 'full' }
    ]
  })],
  ['diagnostic_only_progress', JSON.stringify({
    attempts: [
      { score: 80, date: '2026-07-29T10:00:00Z', sessionType: 'diagnostic' }
    ]
  })]
]);
const context = {
  URL,
  URLSearchParams,
  console,
  localStorage: {
    getItem(key) { return progressByKey.get(key) || null; }
  },
  document: {
    createElement() { return { appendChild() {}, innerHTML: '' }; },
    createTextNode(value) { return { value }; }
  },
  window: {
    location: { hostname: 'localhost', search: '', href: 'http://localhost/' }
  }
};
vm.createContext(context);
vm.runInContext(utilsSource, context, { filename: 'utils.js' });
vm.runInContext(
  classSource + '\n;globalThis.HomePage = HomePage;',
  context,
  { filename: 'homepage.js' }
);
const home = Object.create(context.HomePage.prototype);
const collect = examId => {
  const stats = home.getProgressStats(examId);
  return {
    completionAttempts: stats.completionAttempts,
    lastScore: stats.lastScore,
    lastCompletionScore: stats.lastCompletionScore,
    lastDiagnosticScore: stats.lastDiagnosticScore,
    readiness: home.getReadinessLabel(stats)
  };
};
console.log(JSON.stringify({
  fullThenDiagnostic: collect('full_then_diagnostic'),
  diagnosticThenFull: collect('diagnostic_then_full'),
  diagnosticOnly: collect('diagnostic_only')
}));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/homepage.js"),
                str(ROOT / "assets/js/utils.js"),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        self.assertEqual(
            json.loads(result.stdout),
            {
                "fullThenDiagnostic": {
                    "completionAttempts": 1,
                    "lastScore": 10,
                    "lastCompletionScore": 90,
                    "lastDiagnosticScore": 10,
                    "readiness": "On track",
                },
                "diagnosticThenFull": {
                    "completionAttempts": 1,
                    "lastScore": 20,
                    "lastCompletionScore": 20,
                    "lastDiagnosticScore": 100,
                    "readiness": "Needs work",
                },
                "diagnosticOnly": {
                    "completionAttempts": 0,
                    "lastScore": 80,
                    "lastCompletionScore": None,
                    "lastDiagnosticScore": 80,
                    "readiness": "Diagnostic suggests on track",
                },
            },
        )

    def test_zip_import_in_file_mode_requires_the_supported_local_server(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const helperStart = source.indexOf('window.ExamApp.extractZipArchiveInWorker =');
const helperEnd = source.indexOf('class HomePage');
const helperSource = source.slice(helperStart, helperEnd);
let fileRead = false;
let workerConstructed = false;
const context = {
  URL,
  document: { baseURI: 'file:///tmp/examplar/index.html' },
  window: {
    location: { protocol: 'file:' },
    ExamApp: {
      EXAM_LIMITS: {
        maxZipBytes: 50 * 1024 * 1024,
        maxZipEntries: 512,
        maxZipUncompressedBytes: 120 * 1024 * 1024,
        maxJsonBytes: 5 * 1024 * 1024,
        maxImages: 250,
        maxImageBytes: 10 * 1024 * 1024,
        maxTotalImageBytes: 100 * 1024 * 1024,
        zipWorkerTimeoutMs: 30000
      }
    }
  },
  Worker: class {
    constructor() {
      workerConstructed = true;
      throw new Error('worker should not be constructed for file mode');
    }
  }
};
vm.runInNewContext(helperSource, context, { filename: 'homepage.js' });
(async () => {
  let caught = null;
  try {
    await context.window.ExamApp.extractZipArchiveInWorker({
      name: 'demo.zip',
      size: 128,
      async arrayBuffer() {
        fileRead = true;
        return new ArrayBuffer(128);
      }
    });
  } catch (error) {
    caught = { code: error.code || null, message: error.message };
  }
  console.log(JSON.stringify({ caught, fileRead, workerConstructed }));
})().catch(error => { console.error(error); process.exitCode = 1; });
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/homepage.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual("ZIP_SERVER_REQUIRED", payload["caught"]["code"])
        self.assertIn("python server.py", payload["caught"]["message"])
        self.assertFalse(payload["fileRead"])
        self.assertFalse(payload["workerConstructed"])

    def test_session_configuration_is_tracked_before_runtime_start(self):
        source = (ROOT / "assets/js/exam-init.js").read_text(encoding="utf-8")
        resolved = source.index("const sessionConfig = resolveSessionConfig")
        assignment = source.index("window.examSimulator.examData[examId] =")
        configured = source.index("trackSessionConfigured", assignment)
        study_start = source.index("startStudyMode()", configured)
        exam_start = source.index("startExam()", configured)

        self.assertEqual(source.count("trackSessionConfigured"), 1)
        self.assertLess(resolved, assignment)
        self.assertLess(assignment, configured)
        self.assertLess(configured, study_start)
        self.assertLess(configured, exam_start)
        self.assertIn("sessionType: sessionConfig.sessionType", source)

    def test_landing_cta_uses_one_delegated_click_handler_without_blocking_navigation(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);
const handlers = {};
const sent = [];
let prevented = false;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = (_url, options) => {
  sent.push(JSON.parse(options.body)[0]);
  return Promise.resolve();
};
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: '',
  addEventListener(type, handler) { handlers[type] = handler; },
  getElementById(id) {
    return id === 'analytics-privacy-button' ? {} : null;
  }
};
global.window = {
  location: {
    href: 'https://examplar.app/exams/sc900/',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/exams/sc900/'
  },
  ExamApp: {
    isPublicSiteHost() { return true; }
  }
};
eval(source);
handlers.DOMContentLoaded();

const cta = {
  dataset: {
    analyticsEvent: 'landing_cta_clicked',
    analyticsExam: 'sc900',
    analyticsAction: 'full'
  }
};
handlers.click({
  target: {
    closest(selector) {
      if (selector !== '[data-analytics-event]') {
        throw new Error(`unexpected selector: ${selector}`);
      }
      return cta;
    }
  },
  preventDefault() { prevented = true; }
});
console.log(JSON.stringify({
  prevented,
  eventNames: sent
    .filter((envelope) => envelope.data.baseType === 'EventData')
    .map((envelope) => envelope.data.baseData.name)
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertFalse(payload["prevented"])
        self.assertEqual(payload["eventNames"], ["landing_cta_clicked"])

    def test_homepage_wires_each_commercial_interaction_once(self):
        source = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        expected_calls = (
            "trackProUnlockClicked?.(examId)",
            "trackProModalOpened?.(examId)",
            "trackProImportClicked?.(examId)",
        )
        for call in expected_calls:
            with self.subTest(call=call):
                self.assertEqual(source.count(call), 1)

    def test_purchase_cta_uses_delegated_tracking_and_decorates_before_navigation(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
let source = fs.readFileSync(process.argv[1], 'utf8');
source = source.replace(
  '__APPINSIGHTS_CONNECTION_STRING__',
  'InstrumentationKey=test-key;IngestionEndpoint=https://example.test'
);
const handlers = {};
const sent = [];
let prevented = false;
const localData = new Map();
global.localStorage = {
  getItem(key) { return localData.has(key) ? localData.get(key) : null; },
  setItem(key, value) { localData.set(key, String(value)); },
  removeItem(key) { localData.delete(key); }
};
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = (_url, options) => {
  sent.push(JSON.parse(options.body)[0]);
  return Promise.resolve();
};
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer: 'https://www.google.com/search?q=ai-103',
  addEventListener(type, handler) { handlers[type] = handler; },
  getElementById(id) {
    return id === 'analytics-privacy-button' ? {} : null;
  }
};
global.window = {
  location: {
    href: 'https://examplar.app/exams/az104/?utm_source=google_ads&gclid=Click_ID-123_ABC',
    protocol: 'https:',
    hostname: 'examplar.app',
    pathname: '/exams/az104/'
  },
  ExamApp: { isPublicSiteHost() { return true; } }
};
eval(source);
handlers.DOMContentLoaded();

const cta = {
  href: 'https://examplar.gumroad.com/l/az104-complete/EXAMPLAR30',
  dataset: {
    analyticsEvent: 'pro_purchase_clicked',
    analyticsExam: 'az104',
    analyticsPlacement: 'exam_landing'
  }
};
handlers.click({
  target: {
    closest(selector) {
      return selector === '[data-analytics-event]' ? cta : null;
    }
  },
  preventDefault() { prevented = true; }
});
const decoratedHref = cta.href;
window.ExamApp.analytics.setOptOut(true);
const hrefImmediatelyAfterOptOut = cta.href;
handlers.click({
  target: {
    closest(selector) {
      return selector === '[data-analytics-event]' ? cta : null;
    }
  },
  preventDefault() { prevented = true; }
});
console.log(JSON.stringify({
  prevented,
  decoratedHref,
  hrefImmediatelyAfterOptOut,
  href: cta.href,
  events: sent
    .filter((envelope) => envelope.data.baseType === 'EventData')
    .map((envelope) => envelope.data.baseData)
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(ROOT / "assets/js/analytics.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertFalse(payload["prevented"])
        self.assertEqual(
            parse_qs(urlparse(payload["decoratedHref"]).query),
            {
                "referrer": ["https://www.google.com"],
                "gclid": ["Click_ID-123_ABC"],
            },
        )
        self.assertEqual(
            parse_qs(urlparse(payload["hrefImmediatelyAfterOptOut"]).query),
            {},
        )
        self.assertEqual(parse_qs(urlparse(payload["href"]).query), {})
        self.assertEqual(
            urlparse(payload["href"]).path,
            "/l/az104-complete/EXAMPLAR30",
        )
        self.assertEqual([event["name"] for event in payload["events"]], ["pro_purchase_clicked"])
        self.assertEqual(payload["events"][0]["properties"]["exam_id"], "az104")
        self.assertEqual(payload["events"][0]["properties"]["placement"], "exam_landing")

    def test_every_purchase_surface_uses_the_shared_commerce_contract(self):
        sources = {
            "homepage_modal": (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8"),
            "roadmap_modal": (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8"),
            "results_pro_upsell": (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8"),
            "results_recommended_pro": (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8"),
            "exam_landing": (ROOT / "tools/generate-exam-pages.py").read_text(encoding="utf-8"),
        }
        for placement, source in sources.items():
            with self.subTest(placement=placement):
                self.assertIn("pro_purchase_clicked", source)
                self.assertIn(placement, source)

        for path in (
            ROOT / "assets/js/homepage.js",
            ROOT / "assets/js/roadmaps.js",
            ROOT / "assets/js/script-multi-exam.js",
        ):
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertNotIn('rel="nofollow noopener noreferrer"', source)

    def test_results_screen_wires_trusted_pro_upsell_and_pass_story(self):
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        init = (ROOT / "assets/js/exam-init.js").read_text(encoding="utf-8")

        # exam-init must hand a bundled pack's own pro offer to the runtime while
        # keeping imported metadata from activating a purchase path.
        self.assertIn(
            "pro: isBundledTrusted ? (metadata.pro || null) : null",
            init,
        )

        # The results slot renders the pack's own upsell ahead of the cross-sell,
        # and the pass-story invite links to the public discussion.
        self.assertIn("renderProUpsell", runtime)
        self.assertIn("github.com/rmssantos/examsim/discussions/77", runtime)

        self.assertIn('data-analytics-placement="results_pro_upsell"', runtime)
        self.assertIn('data-analytics-placement="results_recommended_pro"', runtime)
        self.assertEqual(
            runtime.count("trackPassStoryClicked?.(this.currentExam)"),
            1,
        )

    def test_github_star_path_appears_after_exam_value_not_in_study_results(self):
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        analytics = (ROOT / "assets/js/analytics.js").read_text(encoding="utf-8")

        self.assertIn("https://github.com/rmssantos/examsim", runtime)
        self.assertIn("Found this useful?", runtime)
        self.assertIn("Star Examplar on GitHub", runtime)
        self.assertIn('data-analytics-event="github_repository_clicked"', runtime)
        self.assertIn('data-analytics-placement="results_end"', runtime)
        self.assertIn('rel="noopener noreferrer"', runtime)

        study_start = runtime.index("    showStudyResults(")
        study_results = runtime[
            study_start : runtime.index("    showResults(", study_start)
        ]
        self.assertIn("results-recommended-pro", study_results)
        self.assertIn("innerHTML = ''", study_results)

        self.assertIn("function trackGithubRepositoryClicked", analytics)
        self.assertIn("github_repository_clicked", analytics)
        self.assertIn("'results_end', 'guide_end'", analytics)

    def test_secondary_purchase_surfaces_render_launch_offer(self):
        roadmaps = (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8")
        runtime = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        exam_css = (ROOT / "assets/css/exam-v2.css").read_text(encoding="utf-8")
        landing_css = (ROOT / "assets/css/exam-landing.css").read_text(encoding="utf-8")

        self.assertIn("window.ExamApp.getPromotionOffer", roadmaps)
        self.assertIn("pro-modal-offer", roadmaps)
        self.assertIn("window.ExamApp.getPromotionOffer", runtime)
        self.assertIn("results-pro-offer", runtime)
        self.assertIn("Limited launch offer", runtime)
        self.assertIn(".results-pro-offer", exam_css)
        self.assertIn(".pro-offer", landing_css)

    def test_dynamic_purchase_offers_label_prices_plus_taxes(self):
        expected_surfaces = {
            ROOT / "assets/js/homepage.js": 4,
            ROOT / "assets/js/roadmaps.js": 2,
            ROOT / "assets/js/script-multi-exam.js": 4,
        }

        for path, expected_count in expected_surfaces.items():
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertEqual(
                    source.count(" + taxes"),
                    expected_count,
                )

        homepage = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        roadmaps = (ROOT / "assets/js/roadmaps.js").read_text(encoding="utf-8")
        results = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")
        self.assertEqual(homepage.count("${promotion.offerPrice} + taxes"), 2)
        self.assertIn("escapeHtml(promotion.offerPrice) + ' + taxes'", roadmaps)
        self.assertEqual(
            results.count("${this.escapeHtml(promotion.offerPrice)} + taxes"),
            2,
        )

    def test_privacy_copy_discloses_commercial_and_azure_metadata(self):
        page = (ROOT / "privacy-and-storage.html").read_text(encoding="utf-8").lower()
        notes = (ROOT / "PRIVACY-AND-STORAGE.md").read_text(encoding="utf-8").lower()
        analytics = (ROOT / "assets/js/analytics.js").read_text(encoding="utf-8").lower()

        for phrase in (
            "unlock, pro modal, purchase-link, and import-activation counts",
            "results-screen upsell and pass-story link counts",
            "github repository link counts",
            "country, region, and city",
            "browser, operating system, device type, and device model",
            "temporarily uses the sender ip",
            "does not store the full ip address",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, page)

        self.assertIn("commercial interaction events", analytics)
        self.assertIn("coarse location and client metadata", analytics)
        self.assertIn(
            "does not add the extra `referrer` parameter",
            notes,
        )
        self.assertIn(
            "does not add the extra <code>referrer</code> parameter",
            page,
        )
        for disclosure in (page, notes):
            with self.subTest(click_id_disclosure=disclosure[:40]):
                self.assertIn("gclid", disclosure)
                self.assertIn("gbraid", disclosure)
                self.assertIn("wbraid", disclosure)
                self.assertIn("google ads", disclosure)
                self.assertIn("current tab", disclosure)
        self.assertIn("google ads click identifiers", analytics)
        self.assertIn("current tab", analytics)
        self.assertIn("not added to azure product telemetry", analytics)

        for disclosure in (page, notes, analytics):
            with self.subTest(disclosure=disclosure[:40]):
                self.assertIn("one first-answer interaction per study session", disclosure)
                self.assertIn(
                    "study start and first-answer events contain only bounded "
                    "exam/session context",
                    disclosure,
                )
                self.assertIn(
                    "study completion telemetry sends session-level question, answered, "
                    "and correct counts plus coarse accuracy and duration buckets",
                    disclosure,
                )
                self.assertIn(
                    "these aggregates are not linked to question identifiers or content",
                    disclosure,
                )
                self.assertIn(
                    "results from very small study sessions may be inferable",
                    disclosure,
                )
                self.assertIn(
                    "does not send individual answer events, question ids or text, "
                    "options, answer state, or selected responses",
                    disclosure,
                )


if __name__ == "__main__":
    unittest.main()
