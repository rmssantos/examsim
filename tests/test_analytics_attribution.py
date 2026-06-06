import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class AnalyticsAttributionTests(unittest.TestCase):
    def run_attribution_case(self, href, referrer):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
const fs = require('fs');
const source = fs.readFileSync(process.argv[1], 'utf8');
const href = process.argv[2];
const referrer = process.argv[3];
const parsed = new URL(href);

global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.fetch = () => Promise.resolve();
global.HTMLElement = function HTMLElement() {};
global.document = {
  readyState: 'loading',
  referrer,
  addEventListener() {},
  getElementById() { return null; },
};
global.window = {
  location: {
    href,
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    pathname: parsed.pathname
  },
  ExamApp: {
    isPublicSiteHost(host = parsed.hostname) {
      return ['examplar.app', 'www.examplar.app', 'rmssantos.github.io'].includes(host);
    }
  }
};

eval(source);
const analytics = window.ExamApp.analytics._private;
const pageView = analytics.buildPageViewEnvelope();
console.log(JSON.stringify({
  attribution: analytics.attributionProperties(),
  pageProperties: pageView.data.baseData.properties,
  pageUrl: pageView.data.baseData.url
}));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/analytics.js"),
                href,
                referrer,
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def test_product_hunt_ref_is_captured_without_full_referrer_url(self):
        result = self.run_attribution_case(
            "https://examplar.app/?ref=ProductHunt",
            "https://www.producthunt.com/posts/examplar?utm_source=share",
        )
        properties = result["attribution"]

        self.assertEqual(
            {
                "acquisition_ref": "producthunt",
                "referrer_host": "www.producthunt.com",
            },
            properties,
        )
        self.assertEqual("producthunt", result["pageProperties"]["acquisition_ref"])
        self.assertEqual("www.producthunt.com", result["pageProperties"]["referrer_host"])
        self.assertEqual("1.1.0", result["pageProperties"]["analytics_version"])
        self.assertEqual("https://examplar.app/", result["pageUrl"])

    def test_only_approved_campaign_parameters_are_collected(self):
        result = self.run_attribution_case(
            "https://examplar.app/?utm_source=Newsletter&utm_medium=Email&utm_campaign=June-Launch"
            "&utm_content=personal-segment&email=user@example.com&token=secret",
            "",
        )
        properties = result["attribution"]

        self.assertEqual(
            {
                "campaign_source": "newsletter",
                "campaign_medium": "email",
                "campaign_name": "june-launch",
            },
            properties,
        )
        self.assertNotIn("email", properties)
        self.assertNotIn("token", properties)
        self.assertNotIn("utm_content", properties)

    def test_same_site_and_invalid_referrers_are_not_collected(self):
        same_site = self.run_attribution_case(
            "https://examplar.app/exams/",
            "https://www.examplar.app/",
        )["attribution"]
        invalid = self.run_attribution_case(
            "https://examplar.app/",
            "not a url",
        )["attribution"]

        self.assertEqual({}, same_site)
        self.assertEqual({}, invalid)


if __name__ == "__main__":
    unittest.main()
