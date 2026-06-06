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

        script_path = ROOT / "assets" / "js" / "script-multi-exam.js"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('const OFFICIAL_DOCUMENTATION_HOSTS');
const end = source.indexOf('\n\nclass TimerManager');
if (start < 0 || end < 0) throw new Error('documentation URL helper not found');

const sandbox = { URL };
vm.runInNewContext(
  source.slice(start, end) + `
    ;result = {
      awsDocs: isOfficialDocumentationUrl('https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html'),
      awsSite: isOfficialDocumentationUrl('https://aws.amazon.com/documentation/'),
      microsoftDocs: isOfficialDocumentationUrl('https://learn.microsoft.com/en-us/azure/'),
      phishingSuffix: isOfficialDocumentationUrl('https://docs.aws.amazon.com.evil.example/login'),
      credentialTrick: isOfficialDocumentationUrl('https://docs.aws.amazon.com@evil.example/login'),
      arbitraryHttps: isOfficialDocumentationUrl('https://example.com/docs'),
      insecureHttp: isOfficialDocumentationUrl('http://docs.aws.amazon.com/example')
    };
  `,
  sandbox
);
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
                "arbitraryHttps": False,
                "insecureHttp": False,
            },
            json.loads(result.stdout),
        )

    def test_markdown_conversion_keeps_disallowed_links_literal(self):
        script = (ROOT / "assets" / "js" / "script-multi-exam.js").read_text(encoding="utf-8")

        self.assertIn("(match, label, url) => isOfficialDocumentationUrl(url)", script)
        self.assertIn(": match", script)
        self.assertNotIn(
            '\'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>\'',
            script,
        )


if __name__ == "__main__":
    unittest.main()
