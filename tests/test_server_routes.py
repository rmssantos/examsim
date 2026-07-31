"""Regression tests for local clean-route handling."""

import http.client
import http.server
import json
import shutil
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path

import server as app_server


ROOT = Path(__file__).resolve().parents[1]


class _QuietHandler(app_server.MyHTTPRequestHandler):
    def log_message(self, format, *args):
        del format, args


class ServerRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _QuietHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def request(self, path, *, method="GET", headers=None):
        connection = http.client.HTTPConnection(
            "127.0.0.1",
            self.httpd.server_address[1],
            timeout=2,
        )
        try:
            connection.request(method, path, headers=headers or {})
            response = connection.getresponse()
            body = response.read()
            return response, body
        finally:
            connection.close()

    def test_static_get_and_head_reject_non_loopback_host_headers(self):
        invalid_host = f"attacker.example:{self.httpd.server_address[1]}"
        for method in ("GET", "HEAD"):
            with self.subTest(method=method):
                response, body = self.request(
                    "/index.html",
                    method=method,
                    headers={"Host": invalid_host},
                )
                self.assertEqual(421, response.status)
                if method == "GET":
                    self.assertIn(b"Misdirected request", body)

    def test_static_server_never_exposes_dot_directories(self):
        original_directory = app_server.DIRECTORY
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "index.html").write_text("public", encoding="utf-8")
            (root / ".local").mkdir()
            (root / ".local" / "private.txt").write_text(
                "private analytics",
                encoding="utf-8",
            )
            app_server.DIRECTORY = root
            try:
                public_response, public_body = self.request("/index.html")
                self.assertEqual(200, public_response.status)
                self.assertEqual(b"public", public_body)

                for path in (
                    "/.local/private.txt",
                    "/%2elocal/private.txt",
                    "/.%6cocal/private.txt",
                    "/folder/../.local/private.txt",
                ):
                    with self.subTest(path=path):
                        response, body = self.request(path)
                        self.assertEqual(404, response.status)
                        self.assertNotIn(b"private analytics", body)
            finally:
                app_server.DIRECTORY = original_directory

    def test_roadmaps_clean_route_maps_to_static_page(self):
        response, body = self.request("/roadmaps?utm_source=linkedin")
        self.assertEqual(200, response.status)
        self.assertIn(b"<!DOCTYPE html>", body)

    def test_roadmaps_trailing_slash_redirect_preserves_query(self):
        response, _ = self.request(
            "/roadmaps/?utm_source=linkedin&next=%2Fexams%2F&empty="
        )

        self.assertEqual(302, response.status)
        self.assertEqual(
            "/roadmaps?utm_source=linkedin&next=%2Fexams%2F&empty=",
            response.getheader("Location"),
        )


class HostedFallbackTests(unittest.TestCase):
    def test_roadmaps_fallback_preserves_hosted_base_and_query(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        fallback_path = ROOT / "404.html"
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync(process.argv[1], 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('404 fallback script not found');

function resolve(pathname, search) {
  let target = null;
  const sandbox = {
    window: {
      location: {
        pathname,
        search,
        replace(value) { target = value; }
      }
    },
    URLSearchParams
  };
  vm.runInNewContext(match[1], sandbox);
  return target;
}

console.log(JSON.stringify({
  root: resolve('/roadmaps', '?utm_source=linkedin&empty='),
  project: resolve('/examplar/roadmaps', '?utm_campaign=refresh')
}));
"""
        result = subprocess.run(
            [node, "-e", node_script, str(fallback_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)

        self.assertEqual(
            "/roadmaps.html?utm_source=linkedin&empty=",
            payload["root"],
        )
        self.assertEqual(
            "/examplar/roadmaps.html?utm_campaign=refresh",
            payload["project"],
        )


if __name__ == "__main__":
    unittest.main()
