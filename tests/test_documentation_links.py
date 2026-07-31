import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class DocumentationLinkTests(unittest.TestCase):
    def test_only_official_https_documentation_hosts_are_clickable(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        script_path = ROOT / "assets" / "js" / "utils.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const sandbox = {
  window: {
    ExamApp: {},
    location: { hostname: 'examplar.app', search: '' }
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  document: {},
  URL,
  URLSearchParams
};
vm.runInNewContext(source, sandbox);
const check = sandbox.window.ExamApp.isOfficialDocumentationUrl;
sandbox.result = typeof check === 'function' ? {
  awsDocs: check('https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html'),
  awsSite: check('https://aws.amazon.com/documentation/'),
  microsoftDocs: check('https://learn.microsoft.com/en-us/azure/'),
  phishingSuffix: check('https://docs.aws.amazon.com.evil.example/login'),
  credentialTrick: check('https://docs.aws.amazon.com@evil.example/login'),
  allowedHostCredentials: check('https://user:pass@docs.aws.amazon.com/example'),
  arbitraryHttps: check('https://example.com/docs'),
  insecureHttp: check('http://docs.aws.amazon.com/example'),
  nonDefaultPort: check('https://docs.aws.amazon.com:8443/example')
} : null;
console.log(JSON.stringify(sandbox.result));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(script_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )

        self.assertEqual(
            {
                "awsDocs": True,
                "awsSite": True,
                "microsoftDocs": True,
                "phishingSuffix": False,
                "credentialTrick": False,
                "allowedHostCredentials": False,
                "arbitraryHttps": False,
                "insecureHttp": False,
                "nonDefaultPort": False,
            },
            json.loads(result.stdout),
        )

    def test_markdown_conversion_keeps_disallowed_links_literal(self):
        script = (ROOT / "assets" / "js" / "script-multi-exam.js").read_text(encoding="utf-8")

        self.assertIn(
            "(match, label, url) => window.ExamApp.isOfficialDocumentationUrl(url)",
            script,
        )
        self.assertIn(": match", script)
        self.assertNotIn(
            '\'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>\'',
            script,
        )


if __name__ == "__main__":
    unittest.main()
