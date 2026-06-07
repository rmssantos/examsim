import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ConversionFunnelTests(unittest.TestCase):
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

    def test_commercial_events_have_bounded_names_and_properties(self):
        events = self.run_commercial_events()
        self.assertEqual(
            [event["name"] for event in events],
            [
                "pro_unlock_clicked",
                "pro_modal_opened",
                "pro_purchase_clicked",
                "pro_import_clicked",
            ],
        )

        expected_specific = [
            {"exam_id": "az104", "exam_source": "bundled", "placement": "exam_card"},
            {"exam_id": "saac03", "exam_source": "bundled"},
            {"exam_id": "az104", "exam_source": "bundled", "store": "gumroad"},
            {"exam_id": "saac03", "exam_source": "bundled"},
        ]
        common = {
            "app": "examsim",
            "deployment": "github_pages",
            "page": "home",
            "path": "/",
            "analytics_version": "1.2.0",
        }
        for event, specific in zip(events, expected_specific):
            with self.subTest(event=event["name"]):
                self.assertEqual(event["properties"], {**common, **specific})
                self.assertEqual(event["measurements"], {})

    def test_homepage_wires_each_commercial_interaction_once(self):
        source = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        expected_calls = (
            "trackProUnlockClicked?.(examId)",
            "trackProModalOpened?.(examId)",
            "trackProPurchaseClicked?.(examId)",
            "trackProImportClicked?.(examId)",
        )
        for call in expected_calls:
            with self.subTest(call=call):
                self.assertEqual(source.count(call), 1)

    def test_privacy_copy_discloses_commercial_and_azure_metadata(self):
        page = (ROOT / "privacy-and-storage.html").read_text(encoding="utf-8").lower()
        analytics = (ROOT / "assets/js/analytics.js").read_text(encoding="utf-8").lower()

        for phrase in (
            "unlock, pro modal, purchase-link, and import-activation counts",
            "country, region, and city",
            "browser, operating system, device type, and device model",
            "temporarily uses the sender ip",
            "does not store the full ip address",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, page)

        self.assertIn("commercial interaction events", analytics)
        self.assertIn("coarse location and client metadata", analytics)


if __name__ == "__main__":
    unittest.main()
