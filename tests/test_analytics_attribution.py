import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ATTRIBUTION_KEY = "exam_analytics_attribution"


class AnalyticsAttributionTests(unittest.TestCase):
    def run_attribution_scenario(self, pages, *, session=None, opted_out=False):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        scenario = {
            "pages": pages,
            "session": session or {},
            "optedOut": opted_out,
        }
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const scenario = JSON.parse(process.argv[2]);
const sessionData = { ...scenario.session };
const localData = scenario.optedOut ? { exam_analytics_opt_out: 'true' } : {};
const sessionWrites = [];
const localWrites = [];

function makeStorage(data, writes) {
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
      writes.push({ operation: 'set', key, value: String(value) });
    },
    removeItem(key) {
      delete data[key];
      writes.push({ operation: 'remove', key });
    }
  };
}

const sessionStorage = makeStorage(sessionData, sessionWrites);
const localStorage = makeStorage(localData, localWrites);
const outputs = [];

for (const page of scenario.pages) {
  const parsed = new URL(page.href);
  const document = {
    readyState: 'loading',
    referrer: page.referrer || '',
    addEventListener() {},
    getElementById() { return null; },
  };
  const window = {
    location: {
      href: page.href,
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
  const context = {
    URL,
    fetch: () => Promise.resolve(),
    HTMLElement: function HTMLElement() {},
    document,
    window,
    localStorage,
    sessionStorage
  };

  vm.runInNewContext(source, context, { filename: 'analytics.js' });
  const analytics = window.ExamApp.analytics._private;
  const pageView = analytics.buildPageViewEnvelope();
  outputs.push({
    attribution: analytics.attributionProperties(),
    pageProperties: pageView.data.baseData.properties,
    pageUrl: pageView.data.baseData.url
  });
}

console.log(JSON.stringify({
  outputs,
  sessionData,
  localData,
  sessionWrites,
  localWrites
}));
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/analytics.js"),
                json.dumps(scenario),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return json.loads(result.stdout)

    def run_attribution_case(self, href, referrer=""):
        return self.run_attribution_scenario(
            [{"href": href, "referrer": referrer}]
        )["outputs"][0]

    def test_valid_campaign_persists_for_tab_and_new_campaign_replaces_it(self):
        result = self.run_attribution_scenario(
            [
                {
                    "href": (
                        "https://examplar.app/?ref=LinkedIn&utm_source=LinkedIn"
                        "&utm_medium=Organic&utm_campaign=SC900-Refresh"
                        "&utm_content=Post-1"
                    ),
                    "referrer": "https://www.linkedin.com/feed/update/secret-path",
                },
                {
                    "href": "https://examplar.app/exam.html?exam=sc900",
                    "referrer": "https://examplar.app/exams/sc900/",
                },
                {
                    "href": (
                        "https://examplar.app/exams/dp700/"
                        "?utm_source=Partner&utm_campaign=Fabric-Skills"
                    ),
                    "referrer": "https://examplar.app/",
                },
            ]
        )

        initial = {
            "acquisition_ref": "linkedin",
            "campaign_source": "linkedin",
            "campaign_medium": "organic",
            "campaign_name": "sc900-refresh",
            "campaign_content": "post-1",
            "referrer_host": "www.linkedin.com",
        }
        replacement = {
            "campaign_source": "partner",
            "campaign_name": "fabric-skills",
        }
        self.assertEqual(initial, result["outputs"][0]["attribution"])
        self.assertEqual(initial, result["outputs"][1]["attribution"])
        self.assertEqual(replacement, result["outputs"][2]["attribution"])
        self.assertEqual(
            replacement,
            json.loads(result["sessionData"][ATTRIBUTION_KEY]),
        )

        serialized = json.dumps(result)
        self.assertNotIn("linkedin.com/feed", serialized)
        self.assertNotIn("visitor_id", serialized)
        self.assertNotIn("timestamp", serialized)
        self.assertFalse(
            any(write["key"] == ATTRIBUTION_KEY for write in result["localWrites"])
        )

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
        self.assertEqual("1.5.0", result["pageProperties"]["analytics_version"])
        self.assertEqual("https://examplar.app/", result["pageUrl"])

    def test_only_approved_campaign_parameters_are_collected(self):
        result = self.run_attribution_case(
            "https://examplar.app/?utm_source=Newsletter&utm_medium=Email"
            "&utm_campaign=June-Launch&utm_content=Segment-A"
            "&email=user@example.com&token=secret",
        )
        properties = result["attribution"]

        self.assertEqual(
            {
                "campaign_source": "newsletter",
                "campaign_medium": "email",
                "campaign_name": "june-launch",
                "campaign_content": "segment-a",
            },
            properties,
        )
        self.assertNotIn("email", properties)
        self.assertNotIn("token", properties)
        self.assertNotIn("utm_content", properties)

    def test_invalid_explicit_values_clear_old_campaign_and_corrupt_storage(self):
        prior = json.dumps(
            {
                "campaign_source": "old-source",
                "campaign_name": "old-campaign",
                "arbitrary": "must-not-survive",
            }
        )
        invalid = self.run_attribution_scenario(
            [
                {
                    "href": (
                        "https://examplar.app/?ref=user%40example.com"
                        "&utm_source=https%3A%2F%2Fevil.example%2Fcampaign"
                        "&utm_medium=partner%2Faffiliate"
                    )
                }
            ],
            session={ATTRIBUTION_KEY: prior},
        )
        corrupt = self.run_attribution_scenario(
            [{"href": "https://examplar.app/exams/sc900/"}],
            session={ATTRIBUTION_KEY: "{not-json"},
        )

        self.assertEqual({}, invalid["outputs"][0]["attribution"])
        self.assertNotIn(ATTRIBUTION_KEY, invalid["sessionData"])
        self.assertEqual({}, corrupt["outputs"][0]["attribution"])
        self.assertNotIn(ATTRIBUTION_KEY, corrupt["sessionData"])

    def test_stored_values_are_revalidated_and_unknown_fields_are_dropped(self):
        result = self.run_attribution_scenario(
            [{"href": "https://examplar.app/exam.html?exam=sc900"}],
            session={
                ATTRIBUTION_KEY: json.dumps(
                    {
                        "campaign_source": "Newsletter",
                        "campaign_name": "safe-name",
                        "campaign_content": "user@example.com",
                        "referrer_host": "www.linkedin.com/path",
                        "visitor_id": "person-1",
                        "timestamp": "2026-07-30",
                        "arbitrary": "value",
                    }
                )
            },
        )

        self.assertEqual(
            {
                "campaign_source": "newsletter",
                "campaign_name": "safe-name",
            },
            result["outputs"][0]["attribution"],
        )
        self.assertEqual(
            {
                "campaign_source": "newsletter",
                "campaign_name": "safe-name",
            },
            json.loads(result["sessionData"][ATTRIBUTION_KEY]),
        )

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

    def test_private_host_does_not_collect_or_store_attribution(self):
        result = self.run_attribution_scenario(
            [
                {
                    "href": (
                        "https://private.example/?ref=LinkedIn"
                        "&utm_campaign=Must-Not-Persist"
                    ),
                    "referrer": "https://www.linkedin.com/feed/update/private",
                }
            ]
        )

        self.assertEqual({}, result["outputs"][0]["attribution"])
        self.assertNotIn(ATTRIBUTION_KEY, result["sessionData"])
        self.assertFalse(
            any(write["operation"] == "set" for write in result["sessionWrites"])
        )

    def test_opt_out_clears_session_attribution_without_writing_it(self):
        result = self.run_attribution_scenario(
            [
                {
                    "href": (
                        "https://examplar.app/?utm_source=LinkedIn"
                        "&utm_campaign=Should-Not-Persist"
                    )
                }
            ],
            session={
                ATTRIBUTION_KEY: json.dumps(
                    {"campaign_source": "old", "campaign_name": "old"}
                )
            },
            opted_out=True,
        )

        self.assertEqual({}, result["outputs"][0]["attribution"])
        self.assertNotIn(ATTRIBUTION_KEY, result["sessionData"])
        self.assertFalse(
            any(write["operation"] == "set" for write in result["sessionWrites"])
        )


if __name__ == "__main__":
    unittest.main()
