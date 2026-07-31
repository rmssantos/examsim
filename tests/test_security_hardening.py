"""Security regression tests for the local Examplar authoring server."""

import http.client
import http.server
import json
import shutil
import struct
import subprocess
import tempfile
import threading
import unittest
import warnings
import zipfile
from pathlib import Path
from urllib.parse import urlencode

import server as app_server


ROOT = Path(__file__).resolve().parents[1]
PNG_DATA = b"\x89PNG\r\n\x1a\nexamplar-test"
GIF_DATA = b"GIF89aexamplar-test"


class _QuietHandler(app_server.MyHTTPRequestHandler):
    def log_message(self, format, *args):
        del format, args


class LocalUploadSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.original_directory = app_server.DIRECTORY
        app_server.DIRECTORY = Path(self.temp_directory.name)

        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _QuietHandler)
        self.httpd.csrf_token = "deterministic-test-csrf-token"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

        self.port = self.httpd.server_address[1]
        self.loopback_host = f"127.0.0.1:{self.port}"
        self.localhost_host = f"localhost:{self.port}"
        self.loopback_origin = f"http://{self.loopback_host}"
        self.localhost_origin = f"http://{self.localhost_host}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        app_server.DIRECTORY = self.original_directory
        self.temp_directory.cleanup()

    def request(self, method, path, *, host=None, headers=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=2)
        request_headers = dict(headers or {})
        if body is not None and not any(key.lower() == "content-length" for key in request_headers):
            request_headers["Content-Length"] = str(len(body))

        try:
            connection.putrequest(
                method,
                path,
                skip_host=True,
                skip_accept_encoding=True,
            )
            if host is not None:
                connection.putheader("Host", host)
            for key, value in request_headers.items():
                connection.putheader(key, value)
            connection.endheaders()
            if body:
                connection.send(body)

            response = connection.getresponse()
            response_body = response.read()
            response_headers = {
                key.lower(): value for key, value in response.getheaders()
            }
            return response.status, response_headers, response_body
        finally:
            connection.close()

    def upload_path(self, exam="demo", name="diagram.png"):
        return f"/__upload_images?{urlencode({'exam': exam, 'name': name})}"

    def authorized_headers(self, *, hostname="127.0.0.1", token=None):
        host = f"{hostname}:{self.port}"
        return host, {
            "Origin": f"http://{host}",
            "X-Examplar-CSRF-Token": token or self.httpd.csrf_token,
        }

    def assert_no_cors_headers(self, headers):
        self.assertNotIn("access-control-allow-origin", headers)
        self.assertNotIn("access-control-allow-credentials", headers)

    def test_host_and_origin_validation_return_server_derived_values(self):
        class RequestHeaderValue(str):
            def strip(self):
                return self

            def lower(self):
                return self

        class RequestHeaders:
            def __init__(self, values):
                self.values = values

            def get_all(self, name, default):
                return self.values.get(name, default)

        handler = object.__new__(_QuietHandler)
        handler.server = self.httpd

        request_host = RequestHeaderValue(self.loopback_host)
        handler.headers = RequestHeaders({"Host": [request_host]})
        validated_host = handler.validated_host()
        self.assertEqual(self.loopback_host, validated_host)
        self.assertIs(type(validated_host), str)
        self.assertIsNot(request_host, validated_host)

        request_origin = RequestHeaderValue(self.loopback_origin)
        handler.headers = RequestHeaders({"Origin": [request_origin]})
        origin_is_valid, response_origin = handler.validated_origin(
            validated_host,
            required=True,
        )
        self.assertTrue(origin_is_valid)
        self.assertEqual(self.loopback_origin, response_origin)
        self.assertIs(type(response_origin), str)
        self.assertIsNot(request_origin, response_origin)

        for line_break in ("\r", "\n", "\r\n"):
            with self.subTest(line_break=repr(line_break)):
                handler.headers = RequestHeaders({
                    "Origin": [
                        f"{self.loopback_origin}{line_break}X-Injected: true"
                    ],
                })
                self.assertEqual(
                    (False, None),
                    handler.validated_origin(validated_host, required=True),
                )

    def test_invalid_or_missing_host_cannot_obtain_upload_token(self):
        invalid_hosts = [
            None,
            f"attacker.example:{self.port}",
            "127.0.0.1",
            f"localhost.:{self.port}",
            f"127.0.0.1:{self.port + 1}",
        ]

        for host in invalid_hosts:
            with self.subTest(host=host):
                status, headers, body = self.request(
                    "GET",
                    "/__upload_session",
                    host=host,
                )
                self.assertEqual(421, status)
                self.assertNotIn(self.httpd.csrf_token.encode(), body)
                self.assert_no_cors_headers(headers)

    def test_exact_loopback_hosts_receive_a_no_store_session_token(self):
        for host in (self.loopback_host, self.localhost_host):
            with self.subTest(host=host):
                status, headers, body = self.request(
                    "GET",
                    "/__upload_session",
                    host=host,
                )
                self.assertEqual(200, status)
                self.assertEqual(
                    {"csrfToken": self.httpd.csrf_token},
                    json.loads(body),
                )
                self.assertIn("no-store", headers.get("cache-control", ""))
                self.assertEqual(
                    "application/json; charset=utf-8",
                    headers.get("content-type"),
                )
                self.assert_no_cors_headers(headers)

    def test_session_origin_is_optional_but_must_match_host_when_present(self):
        status, headers, body = self.request(
            "GET",
            "/__upload_session",
            host=self.localhost_host,
            headers={"Origin": self.localhost_origin},
        )
        self.assertEqual(200, status)
        self.assertEqual(self.localhost_origin, headers.get("access-control-allow-origin"))
        self.assertEqual("Origin", headers.get("vary"))
        self.assertEqual(self.httpd.csrf_token, json.loads(body)["csrfToken"])

        invalid_origins = [
            self.loopback_origin,
            "null",
            f"https://localhost:{self.port}",
            f"http://localhost:{self.port + 1}",
            f"{self.localhost_origin}/",
            "http://attacker.example",
        ]
        for origin in invalid_origins:
            with self.subTest(origin=origin):
                status, denied_headers, denied_body = self.request(
                    "GET",
                    "/__upload_session",
                    host=self.localhost_host,
                    headers={"Origin": origin},
                )
                self.assertEqual(403, status)
                self.assertNotIn(self.httpd.csrf_token.encode(), denied_body)
                self.assert_no_cors_headers(denied_headers)

    def test_options_is_limited_to_authenticated_upload_preflight_shape(self):
        for host, origin in (
            (self.loopback_host, self.loopback_origin),
            (self.localhost_host, self.localhost_origin),
        ):
            with self.subTest(host=host):
                status, headers, body = self.request(
                    "OPTIONS",
                    "/__upload_images",
                    host=host,
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "PUT",
                        "Access-Control-Request-Headers": (
                            "content-type,x-examplar-csrf-token"
                        ),
                    },
                )
                self.assertEqual(204, status)
                self.assertEqual(b"", body)
                self.assertEqual(origin, headers.get("access-control-allow-origin"))
                self.assertEqual("Origin", headers.get("vary"))
                self.assertEqual(
                    "PUT, OPTIONS",
                    headers.get("access-control-allow-methods"),
                )
                self.assertEqual(
                    "Content-Type, X-Examplar-CSRF-Token",
                    headers.get("access-control-allow-headers"),
                )
                self.assertNotEqual("*", headers.get("access-control-allow-origin"))
                self.assertNotIn("access-control-allow-credentials", headers)

        status, _, _ = self.request(
            "OPTIONS",
            "/not-an-upload-endpoint",
            host=self.loopback_host,
            headers={
                "Origin": self.loopback_origin,
                "Access-Control-Request-Method": "PUT",
            },
        )
        self.assertEqual(404, status)

    def test_options_rejects_missing_invalid_or_cross_alias_origin(self):
        invalid_origins = [
            None,
            "",
            self.loopback_origin,
            "null",
            f"https://localhost:{self.port}",
            "http://attacker.example",
        ]

        for origin in invalid_origins:
            with self.subTest(origin=origin):
                headers = {"Access-Control-Request-Method": "PUT"}
                if origin is not None:
                    headers["Origin"] = origin
                status, response_headers, _ = self.request(
                    "OPTIONS",
                    "/__upload_images",
                    host=self.localhost_host,
                    headers=headers,
                )
                self.assertEqual(403, status)
                self.assert_no_cors_headers(response_headers)

    def test_options_requires_put_as_the_requested_method(self):
        for requested_method in (None, "GET", "POST"):
            with self.subTest(requested_method=requested_method):
                headers = {"Origin": self.loopback_origin}
                if requested_method is not None:
                    headers["Access-Control-Request-Method"] = requested_method
                status, response_headers, _ = self.request(
                    "OPTIONS",
                    "/__upload_images",
                    host=self.loopback_host,
                    headers=headers,
                )
                self.assertEqual(405, status)
                self.assert_no_cors_headers(response_headers)

    def test_put_rejects_host_origin_and_token_before_body_processing(self):
        path = self.upload_path()
        huge_length = str(app_server.MAX_UPLOAD_SIZE + 1)
        cases = [
            (
                "invalid host",
                f"attacker.example:{self.port}",
                {
                    "Origin": self.loopback_origin,
                    "X-Examplar-CSRF-Token": self.httpd.csrf_token,
                    "Content-Length": huge_length,
                },
                421,
            ),
            (
                "missing origin",
                self.loopback_host,
                {
                    "X-Examplar-CSRF-Token": self.httpd.csrf_token,
                    "Content-Length": huge_length,
                },
                403,
            ),
            (
                "cross-alias origin",
                self.localhost_host,
                {
                    "Origin": self.loopback_origin,
                    "X-Examplar-CSRF-Token": self.httpd.csrf_token,
                    "Content-Length": huge_length,
                },
                403,
            ),
            (
                "missing token",
                self.loopback_host,
                {
                    "Origin": self.loopback_origin,
                    "Content-Length": huge_length,
                },
                403,
            ),
            (
                "wrong token",
                self.loopback_host,
                {
                    "Origin": self.loopback_origin,
                    "X-Examplar-CSRF-Token": "wrong-token",
                    "Content-Length": huge_length,
                },
                403,
            ),
            (
                "non-ascii token",
                self.loopback_host,
                {
                    "Origin": self.loopback_origin,
                    "X-Examplar-CSRF-Token": "tökén",
                    "Content-Length": huge_length,
                },
                403,
            ),
        ]

        for label, host, headers, expected_status in cases:
            with self.subTest(label=label):
                status, response_headers, _ = self.request(
                    "PUT",
                    path,
                    host=host,
                    headers=headers,
                )
                self.assertEqual(expected_status, status)
                self.assert_no_cors_headers(response_headers)

        self.assertFalse((Path(self.temp_directory.name) / "user-content").exists())

    def test_valid_authorized_upload_stores_magic_valid_images_only_in_safe_path(self):
        host, headers = self.authorized_headers()
        expected_root = (
            Path(self.temp_directory.name)
            / "user-content"
            / "exams"
            / "demo"
            / "images"
        )

        for file_name, data in (("diagram.png", PNG_DATA), ("diagram.gif", GIF_DATA)):
            with self.subTest(file_name=file_name):
                status, response_headers, body = self.request(
                    "PUT",
                    self.upload_path(name=file_name),
                    host=host,
                    headers=headers,
                    body=data,
                )
                self.assertEqual(200, status)
                self.assertEqual({"filename": file_name}, json.loads(body))
                self.assertEqual(
                    self.loopback_origin,
                    response_headers.get("access-control-allow-origin"),
                )
                self.assertEqual("Origin", response_headers.get("vary"))
                self.assertEqual(data, (expected_root / file_name).read_bytes())

        stored_files = sorted(
            path.relative_to(Path(self.temp_directory.name)).as_posix()
            for path in Path(self.temp_directory.name).rglob("*")
            if path.is_file()
        )
        self.assertEqual(
            [
                "user-content/exams/demo/images/diagram.gif",
                "user-content/exams/demo/images/diagram.png",
            ],
            stored_files,
        )

    def test_authorized_upload_retains_path_magic_and_size_validation(self):
        host, headers = self.authorized_headers()
        cases = [
            ("traversal", self.upload_path(name="../evil.png"), PNG_DATA, None, 400),
            ("invalid exam", self.upload_path(exam="../evil"), PNG_DATA, None, 400),
            ("invalid magic", self.upload_path(name="fake.png"), GIF_DATA, None, 400),
            ("invalid extension", self.upload_path(name="image.svg"), b"<svg/>", None, 400),
            ("empty", self.upload_path(name="empty.png"), b"", None, 400),
            (
                "oversized",
                self.upload_path(name="large.png"),
                None,
                str(app_server.MAX_UPLOAD_SIZE + 1),
                413,
            ),
        ]

        for label, path, body, content_length, expected_status in cases:
            with self.subTest(label=label):
                request_headers = dict(headers)
                if content_length is not None:
                    request_headers["Content-Length"] = content_length
                status, _, _ = self.request(
                    "PUT",
                    path,
                    host=host,
                    headers=request_headers,
                    body=body,
                )
                self.assertEqual(expected_status, status)

        self.assertFalse((Path(self.temp_directory.name) / "evil.png").exists())

    def test_put_wrong_path_returns_not_found_before_upload_auth(self):
        status, headers, _ = self.request(
            "PUT",
            "/not-an-upload-endpoint",
            host=self.loopback_host,
        )
        self.assertEqual(404, status)
        self.assert_no_cors_headers(headers)


class ServiceWorkerUploadSessionTests(unittest.TestCase):
    def test_upload_session_get_bypasses_all_service_worker_cache_strategies(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(process.argv[1], 'utf8');
const handlers = {};
let responded = false;
let responsePromise = null;
let cacheMatches = 0;
let networkFetches = 0;

const sandbox = {
  URL,
  Response,
  console,
  self: {
    location: {
      origin: 'http://127.0.0.1:4173',
      href: 'http://127.0.0.1:4173/'
    },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener(type, handler) { handlers[type] = handler; }
  },
  caches: {
    async match() { cacheMatches += 1; return null; },
    async open() {
      return {
        async put() {},
        async addAll() {}
      };
    },
    async keys() { return []; },
    async delete() { return true; }
  },
  async fetch() {
    networkFetches += 1;
    return {
      ok: true,
      clone() { return this; }
    };
  }
};

vm.runInNewContext(source, sandbox, { filename: process.argv[1] });
const event = {
  request: {
    method: 'GET',
    mode: 'cors',
    url: 'http://127.0.0.1:4173/__upload_session'
  },
  respondWith(value) {
    responded = true;
    responsePromise = Promise.resolve(value);
  }
};
handlers.fetch(event);
if (responsePromise) await responsePromise;
console.log(JSON.stringify({ responded, cacheMatches, networkFetches }));
"""
        result = subprocess.run(
            [node, "--input-type=module", "-e", node_script, str(ROOT / "service-worker.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(
            {"responded": False, "cacheMatches": 0, "networkFetches": 0},
            payload,
        )


class EditorUploadSessionTests(unittest.TestCase):
    def test_editor_caches_token_in_memory_and_retries_only_once_on_403(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        node_script = r"""
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(process.argv[1], 'utf8');
const start = source.indexOf('let uploadCsrfToken = null;');
const end = source.indexOf('async function uploadFiles', start);
if (start < 0 || end < 0) {
  console.log(JSON.stringify({ helperFound: false }));
  process.exit(0);
}
const helperSource = source.slice(start, end);

function response(status, payload = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return payload; }
  };
}

async function runScenario(putStatuses, invocation) {
  const calls = [];
  let sessionCount = 0;
  const remainingStatuses = [...putStatuses];
  const sandbox = {
    fetch: async (url, options = {}) => {
      const headers = { ...(options.headers || {}) };
      calls.push({
        url,
        method: options.method || 'GET',
        cache: options.cache || null,
        credentials: options.credentials || null,
        token: headers['X-Examplar-CSRF-Token'] || null
      });
      if (url === '/__upload_session') {
        sessionCount += 1;
        await Promise.resolve();
        return response(200, { csrfToken: `token-${sessionCount}` });
      }
      return response(remainingStatuses.shift() ?? 200, { filename: 'image.png' });
    }
  };
  vm.runInNewContext(
    helperSource + `
      ;scenarioPromise = (async () => {
        ${invocation}
      })();
    `,
    sandbox
  );
  const statuses = await sandbox.scenarioPromise;
  return {
    statuses,
    calls,
    sessionCalls: calls.filter(call => call.url === '/__upload_session'),
    putCalls: calls.filter(call => call.method === 'PUT')
  };
}

const sequential = await runScenario([200, 200], `
  const first = await uploadImageWithCsrf('/__upload_images?name=one.png', { name: 'one.png' });
  const second = await uploadImageWithCsrf('/__upload_images?name=two.png', { name: 'two.png' });
  return [first.status, second.status];
`);
const concurrent = await runScenario([200, 200], `
  const responses = await Promise.all([
    uploadImageWithCsrf('/__upload_images?name=one.png', { name: 'one.png' }),
    uploadImageWithCsrf('/__upload_images?name=two.png', { name: 'two.png' })
  ]);
  return responses.map(item => item.status);
`);
const retry = await runScenario([403, 200], `
  const result = await uploadImageWithCsrf('/__upload_images?name=retry.png', { name: 'retry.png' });
  return [result.status];
`);
const repeatedForbidden = await runScenario([403, 403, 200], `
  const result = await uploadImageWithCsrf('/__upload_images?name=denied.png', { name: 'denied.png' });
  return [result.status];
`);
const serverError = await runScenario([500, 200], `
  const result = await uploadImageWithCsrf('/__upload_images?name=error.png', { name: 'error.png' });
  return [result.status];
`);

console.log(JSON.stringify({
  helperFound: true,
  usesBrowserStorage: /(?:local|session)Storage/.test(helperSource),
  sequential,
  concurrent,
  retry,
  repeatedForbidden,
  serverError
}));
"""
        result = subprocess.run(
            [node, "--input-type=module", "-e", node_script, str(ROOT / "assets/js/editor.js")],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        payload = json.loads(result.stdout)

        self.assertTrue(payload.get("helperFound"))
        self.assertFalse(payload["usesBrowserStorage"])

        sequential = payload["sequential"]
        self.assertEqual([200, 200], sequential["statuses"])
        self.assertEqual(1, len(sequential["sessionCalls"]))
        self.assertEqual(2, len(sequential["putCalls"]))
        self.assertEqual("no-store", sequential["sessionCalls"][0]["cache"])
        self.assertEqual("same-origin", sequential["sessionCalls"][0]["credentials"])
        self.assertEqual(
            ["token-1", "token-1"],
            [call["token"] for call in sequential["putCalls"]],
        )

        concurrent = payload["concurrent"]
        self.assertEqual(1, len(concurrent["sessionCalls"]))
        self.assertEqual(2, len(concurrent["putCalls"]))

        retry = payload["retry"]
        self.assertEqual([200], retry["statuses"])
        self.assertEqual(2, len(retry["sessionCalls"]))
        self.assertEqual(
            ["token-1", "token-2"],
            [call["token"] for call in retry["putCalls"]],
        )

        repeated_forbidden = payload["repeatedForbidden"]
        self.assertEqual([403], repeated_forbidden["statuses"])
        self.assertEqual(2, len(repeated_forbidden["sessionCalls"]))
        self.assertEqual(2, len(repeated_forbidden["putCalls"]))

        server_error = payload["serverError"]
        self.assertEqual([500], server_error["statuses"])
        self.assertEqual(1, len(server_error["sessionCalls"]))
        self.assertEqual(1, len(server_error["putCalls"]))


class ImportedPackSecurityTests(unittest.TestCase):
    @staticmethod
    def _run_node(node_script, *paths):
        node = shutil.which("node")
        if not node:
            raise unittest.SkipTest("node not available")

        result = subprocess.run(
            [node, "-e", node_script, *(str(path) for path in paths)],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return json.loads(result.stdout)

    def test_runtime_schema_enforces_exact_cardinality_boundaries(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const local = new Map();
const window = {
  ExamApp: {},
  location: { search: '', hostname: 'localhost' }
};
const sandbox = {
  window,
  document: {},
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
    removeItem(key) { local.delete(key); }
  },
  URL,
  URLSearchParams,
  console: { log() {}, warn() {}, error() {} },
  Set,
  Map,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Date,
  Math,
  JSON
};
vm.runInNewContext(source, sandbox, { filename: process.argv[1] });

function question(overrides = {}) {
  return {
    id: 'q1',
    question: 'Question?',
    options: ['A', 'B'],
    correct: 0,
    ...overrides
  };
}

function lab(overrides = {}) {
  return {
    id: 'lab-1',
    domain: 'SEC-1',
    title: 'Safe lab',
    objective: 'Exercise a safe control.',
    prerequisites: ['A test account'],
    freeTierOnly: true,
    estCost: 'No cost.',
    steps: [{ n: 1, instruction: 'Do the step.', expected: 'It works.' }],
    expectedResult: 'The control works.',
    cleanup: ['Delete the test resource.'],
    references: [{
      label: 'Official documentation',
      url: 'https://learn.microsoft.com/security/'
    }],
    sourceVerifiedOn: '2026-07-30',
    objectiveVersion: 'Current objectives',
    ...overrides
  };
}

function validate(q, metadata = null, labs = []) {
  return window.ExamApp.validateExamData([q], metadata, labs);
}

const imageRefs = (count) => Array.from(
  { length: count },
  (_, index) => ({ filename: `image-${index}.png` })
);
const references = (count) => Array.from(
  { length: count },
  () => 'https://learn.microsoft.com/security/'
);
const officialReferences = (count) => Array.from(
  { length: count },
  (_, index) => ({
    label: `Official ${index}`,
    url: 'https://learn.microsoft.com/security/'
  })
);
const steps = (count, imageCount = 0) => Array.from(
  { length: count },
  (_, index) => ({
    n: index + 1,
    instruction: `Step ${index + 1}`,
    expected: 'Expected result',
    ...(index < imageCount ? { image: { filename: `step-${index}.png` } } : {})
  })
);

const cases = {};
function record(name, exact, over) {
  cases[name] = {
    exact: { valid: exact.valid, errors: exact.errors },
    over: { valid: over.valid, errors: over.errors }
  };
}

record(
  'options',
  validate(question({ options: Array(50).fill('A'), correct: 0 })),
  validate(question({ options: Array(51).fill('A'), correct: 0 }))
);
record(
  'correct',
  validate(question({
    question_type: 'MULTI',
    options: Array(50).fill('A'),
    correct: Array.from({ length: 50 }, (_, index) => index)
  })),
  validate(question({
    question_type: 'MULTI',
    options: Array(50).fill('A'),
    correct: Array(51).fill(0)
  }))
);
record(
  'statements',
  validate(question({
    question_type: 'YES_NO_MATRIX',
    options: undefined,
    statements: Array(50).fill('Statement'),
    correct: Array(50).fill(0)
  })),
  validate(question({
    question_type: 'YES_NO_MATRIX',
    options: undefined,
    statements: Array(51).fill('Statement'),
    correct: Array(50).fill(0)
  }))
);
record(
  'questionImages',
  validate(question({ question_images: imageRefs(20) })),
  validate(question({ question_images: imageRefs(21) }))
);
record(
  'questionReferences',
  validate(question({ references: references(20) })),
  validate(question({ references: references(21) }))
);

const exactLabs = Array.from({ length: 50 }, (_, index) => lab({ id: `lab-${index}` }));
const overLabs = Array.from({ length: 51 }, (_, index) => lab({ id: `lab-${index}` }));
record(
  'labs',
  validate(question(), { labCount: 50 }, exactLabs),
  validate(question(), { labCount: 51 }, overLabs)
);
record(
  'labSteps',
  validate(question(), { labCount: 1 }, [lab({ steps: steps(100) })]),
  validate(question(), { labCount: 1 }, [lab({ steps: steps(101) })])
);
record(
  'labImages',
  validate(question(), { labCount: 1 }, [lab({ steps: steps(20, 20) })]),
  validate(question(), { labCount: 1 }, [lab({ steps: steps(21, 21) })])
);
record(
  'labPrerequisites',
  validate(question(), { labCount: 1 }, [lab({ prerequisites: Array(25).fill('Prerequisite') })]),
  validate(question(), { labCount: 1 }, [lab({ prerequisites: Array(26).fill('Prerequisite') })])
);
record(
  'labCleanup',
  validate(question(), { labCount: 1 }, [lab({ cleanup: Array(25).fill('Cleanup') })]),
  validate(question(), { labCount: 1 }, [lab({ cleanup: Array(26).fill('Cleanup') })])
);
record(
  'labReferences',
  validate(question(), { labCount: 1 }, [lab({ references: officialReferences(25) })]),
  validate(question(), { labCount: 1 }, [lab({ references: officialReferences(26) })])
);
record(
  'metadataLists',
  validate(question(), { modules: Array(100).fill('Module'), labCount: 0 }, []),
  validate(question(), { modules: Array(101).fill('Module'), labCount: 0 }, [])
);
const cyclicExactMetadata = {
  objectiveDomains: [{ mappedModules: Array(100).fill('Module') }],
  labCount: 0
};
cyclicExactMetadata.self = cyclicExactMetadata;
const cyclicOverMetadata = {
  objectiveDomains: [{ mappedModules: Array(101).fill('Module') }],
  labCount: 0
};
cyclicOverMetadata.self = cyclicOverMetadata;
record(
  'nestedMetadataLists',
  validate(question(), cyclicExactMetadata, []),
  validate(question(), cyclicOverMetadata, [])
);
record(
  'officialLabReference',
  validate(question(), { labCount: 1 }, [lab()]),
  validate(question(), { labCount: 1 }, [lab({
    references: [{ label: 'Unsafe', url: 'http://learn.microsoft.com/security/' }]
  })])
);

console.log(JSON.stringify({
  limits: window.ExamApp.EXAM_LIMITS,
  cases
}));
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "utils.js",
        )

        expected_limits = {
            "maxOptions": 50,
            "maxStatements": 50,
            "maxCorrectAnswers": 50,
            "maxQuestionImageRefs": 20,
            "maxQuestionReferences": 20,
            "maxLabs": 50,
            "maxLabImageRefs": 20,
            "maxLabSteps": 100,
            "maxLabPrerequisites": 25,
            "maxLabCleanup": 25,
            "maxLabReferences": 25,
            "maxMetadataListItems": 100,
        }
        for name, value in expected_limits.items():
            self.assertEqual(value, payload["limits"].get(name), name)

        for name, result in payload["cases"].items():
            with self.subTest(boundary=name):
                self.assertTrue(result["exact"]["valid"], result["exact"]["errors"])
                self.assertFalse(result["over"]["valid"], name)
                self.assertTrue(result["over"]["errors"], name)

    def test_invalid_types_and_labs_are_rejected_before_any_import_write(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const utilsSource = fs.readFileSync(process.argv[1], 'utf8');
const managerSource = fs.readFileSync(process.argv[2], 'utf8');
const local = new Map();
const writes = [];
const window = {
  ExamApp: {},
  userExams: {},
  location: { search: '', hostname: 'localhost' }
};
window.window = window;
const localStorage = {
  getItem(key) { return local.has(key) ? local.get(key) : null; },
  setItem(key, value) {
    writes.push({ type: 'set', key });
    local.set(key, String(value));
  },
  removeItem(key) {
    writes.push({ type: 'remove', key });
    local.delete(key);
  }
};
const sandbox = {
  window,
  document: {},
  localStorage,
  URL,
  URLSearchParams,
  console: { log() {}, warn() {}, error() {} },
  Set,
  Map,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Date,
  Math,
  JSON,
  Promise
};
vm.runInNewContext(utilsSource, sandbox, { filename: process.argv[1] });
vm.runInNewContext(managerSource, sandbox, { filename: process.argv[2] });
window.ExamApp.examManager.activateExam = (id) => writes.push({ type: 'activate', id });
window.ExamApp.examManager.detectAvailableExams = async () => {
  writes.push({ type: 'detect' });
};

function validQuestion() {
  return { id: 1, question: 'Question?', options: ['A', 'B'], correct: 0 };
}
function validLab(index) {
  return {
    id: `lab-${index}`,
    domain: 'SEC-1',
    title: 'Lab',
    objective: 'Objective',
    prerequisites: ['Account'],
    freeTierOnly: true,
    estCost: 'No cost',
    steps: [{ n: 1, instruction: 'Do it', expected: 'Done' }],
    expectedResult: 'Done',
    cleanup: ['Delete it'],
    references: [{ label: 'Docs', url: 'https://learn.microsoft.com/security/' }],
    sourceVerifiedOn: '2026-07-30',
    objectiveVersion: 'Current'
  };
}

async function attempt(id, data) {
  const before = writes.length;
  try {
    await window.ExamApp.examManager.importExam(id, data);
    return { resolved: true, writes: writes.slice(before) };
  } catch (error) {
    return {
      resolved: false,
      message: error && error.message,
      writes: writes.slice(before)
    };
  }
}

(async () => {
  const numericText = await attempt('numeric-text', {
    questions: [{
      id: 1,
      question: 123,
      explanation: 456,
      options: ['A', 'B'],
      correct: 0
    }],
    labs: [],
    metadata: { questionCount: 1 }
  });
  const oversizedLabs = await attempt('too-many-labs', {
    questions: [validQuestion()],
    labs: Array.from({ length: 51 }, (_, index) => validLab(index)),
    metadata: { questionCount: 1, labCount: 51 }
  });
  const invalidLabsType = await attempt('invalid-labs-type', {
    questions: [validQuestion()],
    labs: { forged: true },
    metadata: { questionCount: 1 }
  });
  const nestedMetadata = await attempt('nested-metadata', {
    questions: [validQuestion()],
    labs: [],
    metadata: {
      questionCount: 1,
      objectiveDomains: [{
        mappedModules: Array(101).fill('Module')
      }]
    }
  });
  console.log(JSON.stringify({
    numericText,
    oversizedLabs,
    invalidLabsType,
    nestedMetadata,
    runtimeIds: Object.keys(window.userExams)
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "utils.js",
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        for scenario in (
            "numericText",
            "oversizedLabs",
            "invalidLabsType",
            "nestedMetadata",
        ):
            self.assertFalse(payload[scenario]["resolved"], scenario)
            self.assertEqual([], payload[scenario]["writes"], scenario)
        self.assertIn("question text", payload["numericText"]["message"].lower())
        self.assertIn("labs", payload["oversizedLabs"]["message"].lower())
        self.assertEqual([], payload["runtimeIds"])

    def test_loader_revalidates_metadata_questions_and_labs_before_registration(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const utilsSource = fs.readFileSync(process.argv[1], 'utf8');
const loaderSource = fs.readFileSync(process.argv[2], 'utf8');
const local = new Map();
const question = { id: 1, question: 'Question?', options: ['A', 'B'], correct: 0 };
const lab = (index) => ({
  id: `lab-${index}`,
  domain: 'SEC-1',
  title: 'Lab',
  objective: 'Objective',
  prerequisites: ['Account'],
  freeTierOnly: true,
  estCost: 'No cost',
  steps: [{ n: 1, instruction: 'Do it', expected: 'Done' }],
  expectedResult: 'Done',
  cleanup: ['Delete it'],
  references: [{ label: 'Docs', url: 'https://learn.microsoft.com/security/' }],
  sourceVerifiedOn: '2026-07-30',
  objectiveVersion: 'Current'
});
const stored = {
  questions: [question],
  labs: { forged: Array.from({ length: 51 }, (_, index) => lab(index)) },
  metadata: { id: 'badstored', questionCount: 1 },
  storage: 'indexedDB'
};
const window = {
  ExamApp: {
    userExams: {},
    examStorage: {
      async listExamIds() { return ['badstored']; },
      async getExam() { return stored; },
      async listProgressExamIds() { return []; }
    }
  },
  location: { search: '', hostname: 'localhost' }
};
window.window = window;
const fetch = async (url) => {
  const value = String(url);
  if (value.endsWith('/index.json')) {
    return { ok: true, async json() { return ['badmeta']; } };
  }
  if (value.endsWith('/badmeta/metadata.json')) {
    return {
      ok: true,
      async json() {
        return {
          id: 'badmeta',
          questionCount: 1,
          totalQuestions: 1,
          modules: Array(101).fill('Module')
        };
      }
    };
  }
  throw new Error(`Unexpected fetch ${value}`);
};
const sandbox = {
  window,
  fetch,
  document: {},
  DOMParser: class {},
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
    removeItem(key) { local.delete(key); }
  },
  URL,
  URLSearchParams,
  console: { log() {}, warn() {}, error() {} },
  Set,
  Map,
  Object,
  Array,
  String,
  Number,
  RegExp,
  Date,
  Math,
  JSON,
  Promise
};
vm.runInNewContext(utilsSource, sandbox, { filename: process.argv[1] });
vm.runInNewContext(loaderSource, sandbox, { filename: process.argv[2] });
window.ExamApp.examsLoadedPromise.then(() => {
  console.log(JSON.stringify({ ids: Object.keys(window.userExams) }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "utils.js",
            ROOT / "assets" / "js" / "exam-loader.js",
        )

        self.assertEqual([], payload["ids"])

    def test_zip_worker_counts_actual_streamed_bytes_and_shared_budgets(self):
        worker_path = ROOT / "assets" / "js" / "zip-import-worker.js"
        vendor_path = ROOT / "assets" / "vendor" / "jszip" / "jszip.min.js"
        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)

            dump = json.dumps(
                [
                    {
                        "id": 1,
                        "question": "Question?",
                        "options": ["A", "B"],
                        "correct": 0,
                    }
                ],
                separators=(",", ":"),
            ).encode()
            exact_zip = temp_root / "exact.zip"
            with zipfile.ZipFile(exact_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dump.json", dump)

            lied_dump = json.dumps(
                [
                    {
                        "id": 1,
                        "question": "Question?",
                        "options": ["A", "B"],
                        "correct": 0,
                        "explanation": "A" * 4096,
                    }
                ],
                separators=(",", ":"),
            ).encode()
            lied_zip = temp_root / "lied.zip"
            with zipfile.ZipFile(lied_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dump.json", lied_dump)
            lied_bytes = bytearray(lied_zip.read_bytes())
            central_signature = b"PK\x01\x02"
            central_offset = lied_bytes.index(central_signature)
            struct.pack_into("<I", lied_bytes, central_offset + 24, 1)
            lied_zip.write_bytes(lied_bytes)

            package_zip = temp_root / "package-later.zip"
            ignored = b"I" * 700
            with zipfile.ZipFile(package_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dump.json", dump)
                archive.writestr("ignored.bin", ignored)

            image_zip = temp_root / "images-later.zip"
            image_one = b"A" * 800
            image_two = b"B" * 800
            with zipfile.ZipFile(image_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dump.json", dump)
                archive.writestr("images/one.png", image_one)
                archive.writestr("images/two.png", image_two)

            selection_zip = temp_root / "selection.zip"
            selected_dump = json.dumps(
                [
                    {
                        "id": 1,
                        "question": "Lexical A",
                        "options": ["A", "B"],
                        "correct": 0,
                    }
                ],
                separators=(",", ":"),
            ).encode()
            other_dump = selected_dump.replace(b"Lexical A", b"Lexical B")
            selected_metadata = b'{"id":"selected-id"}'
            with zipfile.ZipFile(
                selection_zip,
                "w",
                zipfile.ZIP_DEFLATED,
            ) as archive:
                # Equal-length dump paths deliberately arrive in reverse lexical
                # order. The worker must choose deterministically, not by arrival.
                archive.writestr("wrapper/b/dump.json", other_dump)
                archive.writestr("wrapper/a/dump.json", selected_dump)
                archive.writestr(
                    "wrapper/deeper/metadata.json",
                    b'{"id":"wrong-id"}',
                )
                archive.writestr("wrapper/metadata.json", selected_metadata)
                archive.writestr("wrapper/b/shared.png", b"B")
                archive.writestr("wrapper/a/shared.png", b"A")
                archive.writestr("wrapper/images/good.png", b"G")
                archive.writestr("wrapper/images/bad?.png", b"ignored")
                archive.writestr(
                    f"wrapper/images/{'v' * 124}.png",
                    b"V",
                )
                archive.writestr(
                    f"wrapper/images/{'x' * 125}.png",
                    b"must-be-ignored",
                )

            duplicate_bomb_zip = temp_root / "duplicate-bomb.zip"
            with zipfile.ZipFile(
                duplicate_bomb_zip,
                "w",
                zipfile.ZIP_DEFLATED,
            ) as archive:
                archive.writestr("dump.json", dump)
                archive.writestr("a/shared.png", b"A")
                archive.writestr("b/shared.png", b"B" * 1200)
            duplicate_bytes = bytearray(duplicate_bomb_zip.read_bytes())
            search_offset = 0
            duplicate_entry_patched = False
            while True:
                central_offset = duplicate_bytes.find(
                    b"PK\x01\x02",
                    search_offset,
                )
                if central_offset < 0:
                    break
                name_length = struct.unpack_from(
                    "<H",
                    duplicate_bytes,
                    central_offset + 28,
                )[0]
                extra_length = struct.unpack_from(
                    "<H",
                    duplicate_bytes,
                    central_offset + 30,
                )[0]
                comment_length = struct.unpack_from(
                    "<H",
                    duplicate_bytes,
                    central_offset + 32,
                )[0]
                name_start = central_offset + 46
                name = bytes(
                    duplicate_bytes[name_start : name_start + name_length]
                ).decode()
                if name == "b/shared.png":
                    struct.pack_into(
                        "<I",
                        duplicate_bytes,
                        central_offset + 24,
                        1,
                    )
                    duplicate_entry_patched = True
                    break
                search_offset = (
                    name_start + name_length + extra_length + comment_length
                )
            if not duplicate_entry_patched:
                self.fail("Could not patch duplicate image central directory")
            duplicate_bomb_zip.write_bytes(duplicate_bytes)

            node_script = r"""
const fs = require('fs');
const { Worker } = require('worker_threads');
const workerSourcePath = process.argv[1];
const vendorPath = process.argv[2];
const archivePaths = process.argv.slice(3);
const wrapper = `
  const fs = require('fs');
  const vm = require('vm');
  const { parentPort, workerData } = require('worker_threads');
  global.self = global;
  global.importScripts = () => {
    const source = fs.readFileSync(workerData.vendorPath, 'utf8');
    vm.runInThisContext(
      '(function () {'
        + 'const module = undefined, exports = undefined, define = undefined;'
        + source
        + '}).call(globalThis);',
      { filename: workerData.vendorPath }
    );
  };
  global.postMessage = (payload, transfer) => parentPort.postMessage(payload, transfer);
  global.close = () => setImmediate(() => process.exit(0));
  vm.runInThisContext(
    fs.readFileSync(workerData.workerSourcePath, 'utf8'),
    { filename: workerData.workerSourcePath }
  );
  parentPort.on('message', (data) => global.self.onmessage({ data }));
`;

function runArchive(path, limits) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(wrapper, {
      eval: true,
      workerData: { workerSourcePath, vendorPath }
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`worker timed out for ${path}`));
    }, 10000);
    worker.once('message', (message) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(message);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const bytes = fs.readFileSync(path);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    worker.postMessage({ archiveBuffer: buffer, limits }, [buffer]);
  });
}

(async () => {
  const [
    exactPath,
    liedPath,
    packagePath,
    imagePath,
    selectionPath,
    duplicateBombPath
  ] = archivePaths;
  const exactBytes = Number(process.env.EXACT_BYTES);
  const dumpBytes = Number(process.env.DUMP_BYTES);
  const common = {
    maxZipEntries: 20,
    maxZipUncompressedBytes: 10000,
    maxJsonBytes: 10000,
    maxImages: 10,
    maxImageBytes: 1000,
    maxTotalImageBytes: 10000
  };
  let heartbeats = 0;
  const heartbeat = setInterval(() => { heartbeats += 1; }, 1);
  const exact = await runArchive(exactPath, {
    ...common,
    maxZipUncompressedBytes: exactBytes,
    maxJsonBytes: exactBytes
  });
  clearInterval(heartbeat);
  const maxPlusOne = await runArchive(exactPath, {
    ...common,
    maxZipUncompressedBytes: exactBytes - 1
  });
  const declaredLie = await runArchive(liedPath, {
    ...common,
    maxZipUncompressedBytes: 1024
  });
  const packageLater = await runArchive(packagePath, {
    ...common,
    maxZipUncompressedBytes: dumpBytes + 699
  });
  const imageLater = await runArchive(imagePath, {
    ...common,
    maxTotalImageBytes: 1500
  });
  const selection = await runArchive(selectionPath, common);
  const duplicatePerImage = await runArchive(duplicateBombPath, {
    ...common,
    maxImageBytes: 1000,
    maxTotalImageBytes: 5000
  });
  const duplicateShared = await runArchive(duplicateBombPath, {
    ...common,
    maxImageBytes: 2000,
    maxTotalImageBytes: 1000
  });
  const duplicateCount = await runArchive(duplicateBombPath, {
    ...common,
    maxImages: 1,
    maxImageBytes: 2000,
    maxTotalImageBytes: 5000
  });
  const decode = (buffer) => Buffer.from(buffer).toString('utf8');
  console.log(JSON.stringify({
    exact: {
      ok: exact.ok,
      dumpBytes: exact.dumpBuffer && exact.dumpBuffer.byteLength,
      heartbeats
    },
    maxPlusOne,
    declaredLie,
    packageLater,
    imageLater,
    duplicatePerImage,
    duplicateShared,
    duplicateCount,
    selection: {
      ok: selection.ok,
      question: selection.ok
        ? JSON.parse(decode(selection.dumpBuffer))[0].question
        : null,
      metadataId: selection.ok
        ? JSON.parse(decode(selection.metadataBuffer)).id
        : null,
      derivedExamId: selection.derivedExamId,
      images: selection.ok
        ? selection.imageFiles.map((image) => ({
            fileName: image.fileName,
            content: decode(image.buffer)
          }))
        : []
    }
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
            node = shutil.which("node")
            if not node:
                self.skipTest("node not available")
            result = subprocess.run(
                [
                    node,
                    "-e",
                    node_script,
                    str(worker_path),
                    str(vendor_path),
                    str(exact_zip),
                    str(lied_zip),
                    str(package_zip),
                    str(image_zip),
                    str(selection_zip),
                    str(duplicate_bomb_zip),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
                env={
                    **dict(__import__("os").environ),
                    "EXACT_BYTES": str(len(dump)),
                    "DUMP_BYTES": str(len(dump)),
                },
            )
            payload = json.loads(result.stdout)

        self.assertTrue(payload["exact"]["ok"], payload)
        self.assertEqual(len(dump), payload["exact"]["dumpBytes"])
        self.assertGreater(payload["exact"]["heartbeats"], 0)
        for scenario in (
            "maxPlusOne",
            "declaredLie",
            "packageLater",
            "imageLater",
            "duplicatePerImage",
            "duplicateShared",
            "duplicateCount",
        ):
            with self.subTest(scenario=scenario):
                self.assertFalse(payload[scenario]["ok"])
                self.assertEqual(
                    "ZIP_LIMIT_EXCEEDED",
                    payload[scenario]["error"]["code"],
                )
        self.assertEqual(
            {
                "ok": True,
                "question": "Lexical A",
                "metadataId": "selected-id",
                "derivedExamId": "wrapper",
                "images": [
                    {"fileName": "good.png", "content": "G"},
                    {"fileName": "shared.png", "content": "A"},
                    {"fileName": f"{'v' * 124}.png", "content": "V"},
                ],
            },
            payload["selection"],
        )

    def test_zip_worker_raw_preflight_rejects_unsafe_archives_before_jszip(self):
        worker_path = ROOT / "assets" / "js" / "zip-import-worker.js"
        with tempfile.TemporaryDirectory() as tmp:
            temp_root = Path(tmp)
            dump = json.dumps(
                [
                    {
                        "id": 1,
                        "question": "Question?",
                        "options": ["A", "B"],
                        "correct": 0,
                    }
                ],
                separators=(",", ":"),
            ).encode()

            valid_zip = temp_root / "valid.zip"
            with zipfile.ZipFile(valid_zip, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("dump.json", dump)

            excessive_zip = temp_root / "excessive.zip"
            with zipfile.ZipFile(excessive_zip, "w", zipfile.ZIP_STORED) as archive:
                archive.writestr("dump.json", dump)
                for index in range(512):
                    archive.writestr(f"empty/{index:03d}.txt", b"")

            duplicate_zip = temp_root / "duplicate.zip"
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(
                    duplicate_zip,
                    "w",
                    zipfile.ZIP_STORED,
                ) as archive:
                    archive.writestr("dump.json", dump)
                    archive.writestr("dump.json", dump)

            alias_zip = temp_root / "alias.zip"
            with zipfile.ZipFile(alias_zip, "w", zipfile.ZIP_STORED) as archive:
                archive.writestr("dump.json", dump)
                archive.writestr("folder/../dump.json", dump)

            zip64_zip = temp_root / "zip64.zip"
            zip64_bytes = bytearray(valid_zip.read_bytes())
            eocd_offset = zip64_bytes.rfind(b"PK\x05\x06")
            self.assertGreaterEqual(eocd_offset, 0)
            struct.pack_into("<H", zip64_bytes, eocd_offset + 8, 0xFFFF)
            struct.pack_into("<H", zip64_bytes, eocd_offset + 10, 0xFFFF)
            zip64_zip.write_bytes(zip64_bytes)

            malformed_zip = temp_root / "malformed.zip"
            malformed_bytes = bytearray(valid_zip.read_bytes())
            central_offset = malformed_bytes.find(b"PK\x01\x02")
            self.assertGreaterEqual(central_offset, 0)
            malformed_bytes[central_offset : central_offset + 4] = b"BAD!"
            malformed_zip.write_bytes(malformed_bytes)

            node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const paths = process.argv.slice(2);
let loadCalls = 0;
let resolveMessage = null;
const sandbox = {
  self: null,
  ArrayBuffer,
  Uint8Array,
  DataView,
  Number,
  Object,
  Array,
  String,
  RegExp,
  Map,
  Set,
  Error,
  Promise,
  console,
  importScripts() {},
  postMessage(payload) {
    if (resolveMessage) resolveMessage(payload);
  },
  close() {},
  JSZip: {
    async loadAsync() {
      loadCalls += 1;
      throw new Error('JSZip must not run for a raw-preflight rejection');
    }
  }
};
sandbox.self = sandbox;
vm.runInNewContext(source, sandbox, { filename: process.argv[1] });

async function run(path, limits = {}) {
  const bytes = fs.readFileSync(path);
  const archiveBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  return new Promise((resolve) => {
    resolveMessage = resolve;
    sandbox.self.onmessage({ data: { archiveBuffer, limits } });
  });
}

(async () => {
  const [
    validPath,
    excessivePath,
    duplicatePath,
    aliasPath,
    zip64Path,
    malformedPath
  ] = paths;
  const rawTooLarge = await run(validPath, {
    maxZipBytes: fs.statSync(validPath).size - 1
  });
  const excessive = await run(excessivePath, { maxZipEntries: 512 });
  const duplicate = await run(duplicatePath);
  const alias = await run(aliasPath);
  const zip64 = await run(zip64Path);
  const malformed = await run(malformedPath);
  console.log(JSON.stringify({
    loadCalls,
    rawTooLarge,
    excessive,
    duplicate,
    alias,
    zip64,
    malformed
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
            node = shutil.which("node")
            if not node:
                self.skipTest("node not available")
            result = subprocess.run(
                [
                    node,
                    "-e",
                    node_script,
                    str(worker_path),
                    str(valid_zip),
                    str(excessive_zip),
                    str(duplicate_zip),
                    str(alias_zip),
                    str(zip64_zip),
                    str(malformed_zip),
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            payload = json.loads(result.stdout)

        self.assertEqual(0, payload["loadCalls"])
        self.assertEqual(
            "ZIP_LIMIT_EXCEEDED",
            payload["rawTooLarge"]["error"]["code"],
        )
        self.assertEqual(
            "ZIP_LIMIT_EXCEEDED",
            payload["excessive"]["error"]["code"],
        )
        for scenario in ("duplicate", "alias", "zip64", "malformed"):
            with self.subTest(scenario=scenario):
                self.assertFalse(payload[scenario]["ok"])
                self.assertEqual(
                    "ZIP_INVALID_ARCHIVE",
                    payload[scenario]["error"]["code"],
                )

    def test_zip_import_main_thread_times_out_transfers_and_never_decompresses(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(process.argv[1], 'utf8');
const helperStart = source.indexOf('window.ExamApp.extractZipArchiveInWorker =');
const helperEnd = source.indexOf('class HomePage', helperStart);
if (helperStart < 0 || helperEnd < 0) {
  console.log(JSON.stringify({ helperFound: false }));
  process.exit(0);
}
const helperSource = source.slice(helperStart, helperEnd);
const workers = [];
class FakeWorker {
  constructor() {
    this.terminated = false;
    this.transfer = null;
    this.message = null;
    workers.push(this);
  }
  postMessage(message, transfer) {
    this.message = message;
    this.transfer = transfer;
  }
  terminate() {
    this.terminated = true;
  }
}
const window = {
  ExamApp: {
    EXAM_LIMITS: {
      maxZipBytes: 50 * 1024 * 1024,
      maxZipEntries: 512,
      maxZipUncompressedBytes: 120 * 1024 * 1024,
      maxJsonBytes: 5 * 1024 * 1024,
      maxImages: 250,
      maxImageBytes: 10 * 1024 * 1024,
      maxTotalImageBytes: 100 * 1024 * 1024,
      zipWorkerTimeoutMs: 5
    }
  }
};
const sandbox = {
  window,
  document: { baseURI: 'https://examplar.app/' },
  Worker: FakeWorker,
  URL,
  Error,
  setTimeout,
  clearTimeout,
  Promise,
  ArrayBuffer
};
vm.runInNewContext(helperSource, sandbox, { filename: process.argv[1] });

(async () => {
  let failure = null;
  try {
    await window.ExamApp.extractZipArchiveInWorker({
      size: 16,
      async arrayBuffer() { return new ArrayBuffer(16); }
    });
  } catch (error) {
    failure = { code: error.code, message: error.message };
  }
  let oversizedFailure = null;
  let oversizedRead = false;
  try {
    await window.ExamApp.extractZipArchiveInWorker({
      size: window.ExamApp.EXAM_LIMITS.maxZipBytes + 1,
      async arrayBuffer() {
        oversizedRead = true;
        return new ArrayBuffer(1);
      }
    });
  } catch (error) {
    oversizedFailure = { code: error.code, message: error.message };
  }
  console.log(JSON.stringify({
    helperFound: true,
    failure,
    oversizedFailure,
    oversizedRead,
    workerCount: workers.length,
    terminated: workers[0] && workers[0].terminated,
    transferCount: workers[0] && workers[0].transfer && workers[0].transfer.length,
    transferredBytes: workers[0] && workers[0].transfer
      && workers[0].transfer[0].byteLength,
    forwardedMaxZipBytes: workers[0] && workers[0].message
      && workers[0].message.limits.maxZipBytes
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "homepage.js",
        )

        self.assertTrue(payload["helperFound"])
        self.assertEqual("ZIP_WORKER_TIMEOUT", payload["failure"]["code"])
        self.assertTrue(payload["terminated"])
        self.assertEqual(1, payload["transferCount"])
        # A transferred ArrayBuffer is detached in a real Worker implementation;
        # FakeWorker records the same object so its original size remains visible.
        self.assertEqual(16, payload["transferredBytes"])
        self.assertEqual(50 * 1024 * 1024, payload["forwardedMaxZipBytes"])
        self.assertEqual(
            "ZIP_LIMIT_EXCEEDED",
            payload["oversizedFailure"]["code"],
        )
        self.assertFalse(payload["oversizedRead"])
        self.assertEqual(1, payload["workerCount"])

        homepage_source = (ROOT / "assets" / "js" / "homepage.js").read_text(
            encoding="utf-8"
        )
        worker_source = (
            ROOT / "assets" / "js" / "zip-import-worker.js"
        ).read_text(encoding="utf-8")
        image_storage_source = (
            ROOT / "assets" / "js" / "image-storage.js"
        ).read_text(encoding="utf-8")
        self.assertNotIn("JSZip.loadAsync", homepage_source)
        self.assertNotRegex(homepage_source, r"\.async\s*\(")
        self.assertIn("new Worker(", homepage_source)
        self.assertIn("worker.terminate()", homepage_source)
        self.assertIn("new TextDecoder(", homepage_source)
        self.assertNotIn("storeImageBlob(", homepage_source)
        self.assertIn("new Blob(", image_storage_source)
        self.assertIn(
            "importScripts('../vendor/jszip/jszip.min.js')",
            worker_source,
        )
        self.assertIn("internalStream('uint8array')", worker_source)
        self.assertNotIn("TextDecoder", worker_source)
        self.assertNotRegex(worker_source, r"\bnew Blob\s*\(")

    def test_import_conflicts_are_explicit_atomic_and_preserve_provenance(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const managerSource = fs.readFileSync(process.argv[1], 'utf8');

function makeEnvironment({
  runtimeExisting = false,
  storageExisting = false,
  storageType = 'indexedDB',
  failPut = false,
  putResult = true,
  legacyResult = true,
  seedLegacy = false,
  legacyFailureAfter = 0,
  legacyFailureReturnsFalse = false,
  rollbackFailure = false,
  registryThrows = false
} = {}) {
  const calls = [];
  const local = new Map();
  if (seedLegacy) {
    local.set(
      'custom_paid-preview_questions',
      JSON.stringify([{ id: 1, question: 'old legacy question' }])
    );
    local.set(
      'exam_metadata_paid-preview',
      JSON.stringify({ name: 'Old legacy metadata' })
    );
    local.set(
      'custom_paid-preview_labs',
      JSON.stringify([{ id: 'old-legacy-lab' }])
    );
  }
  const localStorage = {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) {
      const serialized = String(value);
      calls.push({ type: 'local-write', key });
      if (
        rollbackFailure
        && key === 'custom_paid-preview_questions'
        && serialized.includes('old legacy question')
      ) {
        throw new Error('simulated rollback failure');
      }
      local.set(key, serialized);
    },
    removeItem(key) { calls.push({ type: 'local-delete', key }); local.delete(key); }
  };
  const window = {
    userExams: {},
    ExamApp: {
      STORAGE_KEYS: { exams: 'examplar_exam_registry', progress: 'examplar_progress_registry' },
      normalizeExamId(id) { return String(id || '').trim().toLowerCase(); },
      isSafeExamId(id) { return /^[a-z0-9][a-z0-9-]*$/.test(String(id)); },
      validateExamData() {
        calls.push({ type: 'validate' });
        return { valid: true, errors: [] };
      },
      addToRegistry(key, id) {
        calls.push({ type: 'registry', key, id });
        if (registryThrows) throw new Error('simulated registry failure');
      },
      removeFromRegistry() { calls.push({ type: 'registry-delete' }); },
      log() {},
      warn(message) { calls.push({ type: 'warn', message: String(message) }); },
      examStorage: {
        async getExam(id, options) {
          calls.push({ type: 'storage-read', id, options });
          return storageExisting ? {
            examId: id,
            questions: [{ id: 1, question: 'old stored question' }],
            metadata: { name: 'Stored original' },
            source: 'imported',
            trust: 'local-unverified',
            storage: storageType
          } : null;
        },
        async putExam(id, questions, metadata, options) {
          calls.push({ type: 'idb-write', id, questions, metadata, options });
          if (failPut) throw new Error('simulated IndexedDB failure');
          return putResult;
        },
        putLegacyExam(id, questions, metadata, labs) {
          calls.push({ type: 'legacy-write', id, questions, metadata, labs });
          if (!legacyResult && legacyFailureAfter === 0) return false;
          localStorage.setItem(`custom_${id}_questions`, JSON.stringify(questions));
          if (legacyFailureAfter > 0) {
            if (legacyFailureAfter === 1) {
              if (legacyFailureReturnsFalse) return false;
              throw new Error('legacy failure after questions');
            }
            localStorage.setItem(`exam_metadata_${id}`, JSON.stringify(metadata));
            if (legacyFailureAfter === 2) {
              if (legacyFailureReturnsFalse) return false;
              throw new Error('legacy failure after metadata');
            }
          }
          localStorage.setItem(`exam_metadata_${id}`, JSON.stringify(metadata));
          if (Array.isArray(labs) && labs.length) {
            localStorage.setItem(`custom_${id}_labs`, JSON.stringify(labs));
          } else {
            localStorage.removeItem(`custom_${id}_labs`);
          }
          return true;
        },
        legacyQuestionKey(id) { return `custom_${id}_questions`; },
        legacyMetadataKey(id) { return `exam_metadata_${id}`; },
        legacyLabsKey(id) { return `custom_${id}_labs`; },
        async deleteExam() { calls.push({ type: 'storage-delete' }); },
        async deleteProgress() { calls.push({ type: 'progress-delete' }); }
      }
    }
  };
  if (runtimeExisting) {
    window.userExams['paid-preview'] = {
      questions: [{ id: 1, question: 'old bundled question' }],
      metadata: { name: 'Paid preview', preview: true },
      source: 'bundled',
      trust: 'bundled'
    };
  }
  const sandbox = {
    window,
    localStorage,
    console: { log() {}, warn() {}, error() {} },
    JSON,
    Map,
    Object,
    Array,
    String,
    RegExp,
    Promise
  };
  vm.runInNewContext(managerSource, sandbox);
  const manager = window.ExamApp.examManager;
  manager.activateExam = (id) => calls.push({ type: 'activate', id });
  manager.detectAvailableExams = async () => calls.push({ type: 'detect' });
  return { window, manager, calls, local };
}

function importedData() {
  return {
    questions: [{ id: 1, question: 'new complete question', options: ['A', 'B'], correct: 0 }],
    labs: [],
    metadata: {
      name: 'Forged Complete',
      overwrite: true,
      source: 'bundled',
      trust: 'bundled',
      pro: { url: 'https://evil.example/buy' },
      recommendedPro: { url: 'https://evil.example/upgrade' }
    }
  };
}

async function attempt(env, options) {
  try {
    const value = await env.manager.importExam('paid-preview', importedData(), null, options);
    return { resolved: value, code: null, message: null };
  } catch (error) {
    return {
      resolved: null,
      code: (error && error.code) || null,
      message: (error && error.message) || null
    };
  }
}

function legacyState(env) {
  const parse = (key) => env.local.has(key) ? JSON.parse(env.local.get(key)) : null;
  return {
    questions: parse('custom_paid-preview_questions'),
    metadata: parse('exam_metadata_paid-preview'),
    labs: parse('custom_paid-preview_labs')
  };
}

(async () => {
  const runtime = makeEnvironment({ runtimeExisting: true });
  const runtimeResult = await attempt(runtime);

  const stored = makeEnvironment({ storageExisting: true });
  const storedResult = await attempt(stored);

  const stringOverwrite = makeEnvironment({ runtimeExisting: true });
  const stringResult = await attempt(stringOverwrite, { overwrite: 'true' });

  const explicit = makeEnvironment({ runtimeExisting: true, storageExisting: true });
  const explicitResult = await attempt(explicit, { overwrite: true });
  const written = explicit.calls.find((call) => call.type === 'idb-write');
  const runtimeRecord = explicit.window.userExams['paid-preview'];

  const failed = makeEnvironment({
    runtimeExisting: true,
    storageExisting: true,
    failPut: true
  });
  const failedResult = await attempt(failed, { overwrite: true });

  const registryFailure = makeEnvironment({
    runtimeExisting: true,
    storageExisting: true,
    registryThrows: true
  });
  const registryFailureResult = await attempt(registryFailure, { overwrite: true });

  const fallbackCases = {
    runtimeFallback: {
      config: { runtimeExisting: true, putResult: false },
      options: { overwrite: true }
    },
    legacyFallback: {
      config: { storageExisting: true, storageType: 'localStorage', putResult: false },
      options: { overwrite: true }
    },
    newFallback: { config: { putResult: false }, options: undefined },
    rejectedLegacyFallback: {
      config: { runtimeExisting: true, putResult: false, legacyResult: false },
      options: { overwrite: true }
    },
    failedIdbResult: {
      config: { storageExisting: true, storageType: 'indexedDB', putResult: false },
      options: { overwrite: true }
    },
    partialAfterQuestions: {
      config: {
        runtimeExisting: true, putResult: false, seedLegacy: true, legacyFailureAfter: 1
      },
      options: { overwrite: true }
    },
    partialAfterMetadata: {
      config: {
        runtimeExisting: true, putResult: false, seedLegacy: true,
        legacyFailureAfter: 2, legacyFailureReturnsFalse: true
      },
      options: { overwrite: true }
    },
    failedRollback: {
      config: {
        runtimeExisting: true, putResult: false, seedLegacy: true,
        legacyFailureAfter: 1, rollbackFailure: true
      },
      options: { overwrite: true }
    },
    authoritativePartialMirror: {
      config: {
        runtimeExisting: true, storageExisting: true, putResult: true,
        seedLegacy: true, legacyFailureAfter: 1
      },
      options: { overwrite: true }
    }
  };
  const fallbackScenarios = {};
  for (const [name, definition] of Object.entries(fallbackCases)) {
    const env = makeEnvironment(definition.config);
    fallbackScenarios[name] = {
      result: await attempt(env, definition.options),
      calls: env.calls,
      runtimeRecord: env.window.userExams['paid-preview'],
      legacy: legacyState(env)
    };
  }

  console.log(JSON.stringify({
    runtime: { result: runtimeResult, calls: runtime.calls },
    stored: { result: storedResult, calls: stored.calls },
    stringOverwrite: { result: stringResult, calls: stringOverwrite.calls },
    explicit: {
      result: explicitResult,
      calls: explicit.calls,
      written,
      runtimeRecord
    },
    failed: { result: failedResult, calls: failed.calls },
    registryFailure: {
      result: registryFailureResult,
      calls: registryFailure.calls,
      runtimeRecord: registryFailure.window.userExams['paid-preview']
    },
    ...fallbackScenarios
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        write_types = {
            "idb-write",
            "legacy-write",
            "registry",
            "activate",
            "detect",
            "storage-delete",
            "progress-delete",
            "local-write",
        }
        for scenario in ("runtime", "stored", "stringOverwrite"):
            self.assertEqual("EXAM_ID_CONFLICT", payload[scenario]["result"]["code"])
            self.assertFalse(
                any(call["type"] in write_types for call in payload[scenario]["calls"]),
                scenario,
            )

        failed_rollback = payload["failedRollback"]
        self.assertFalse(failed_rollback["result"]["resolved"])
        self.assertIn("Rollback also failed", failed_rollback["result"]["message"])
        self.assertTrue(
            any(
                call["type"] == "warn"
                and "rollback failed" in call["message"].lower()
                for call in failed_rollback["calls"]
            )
        )
        self.assertEqual(
            "old bundled question",
            failed_rollback["runtimeRecord"]["questions"][0]["question"],
        )
        self.assertFalse(
            any(
                call["type"] in {"registry", "activate", "detect"}
                for call in failed_rollback["calls"]
            )
        )

        stored_read = next(
            call for call in payload["stored"]["calls"] if call["type"] == "storage-read"
        )
        self.assertEqual({"migrateLegacy": False}, stored_read["options"])

        explicit = payload["explicit"]
        self.assertTrue(explicit["result"]["resolved"])
        self.assertEqual(1, sum(call["type"] == "idb-write" for call in explicit["calls"]))
        self.assertFalse(
            any(
                call["type"] in {"storage-delete", "progress-delete"}
                for call in explicit["calls"]
            )
        )
        self.assertEqual("imported", explicit["runtimeRecord"]["source"])
        self.assertEqual("local-unverified", explicit["runtimeRecord"]["trust"])
        for authority_field in ("source", "trust", "pro", "recommendedPro"):
            self.assertNotIn(authority_field, explicit["runtimeRecord"]["metadata"])
            self.assertNotIn(authority_field, explicit["written"]["metadata"])
        self.assertEqual(
            {"source": "imported", "trust": "local-unverified", "labs": []},
            explicit["written"]["options"],
        )

        failed = payload["failed"]
        self.assertIsNone(failed["result"]["code"])
        self.assertIn("IndexedDB", failed["result"]["message"])
        self.assertFalse(
            any(
                call["type"]
                in {"legacy-write", "registry", "activate", "detect", "local-write"}
                for call in failed["calls"]
            )
        )

        registry_failure = payload["registryFailure"]
        self.assertTrue(registry_failure["result"]["resolved"])
        self.assertEqual(
            "new complete question",
            registry_failure["runtimeRecord"]["questions"][0]["question"],
        )
        self.assertTrue(
            any(
                call["type"] == "warn"
                and "registry" in call["message"].lower()
                for call in registry_failure["calls"]
            )
        )

        for scenario in ("runtimeFallback", "legacyFallback", "newFallback"):
            fallback = payload[scenario]
            self.assertTrue(fallback["result"]["resolved"], scenario)
            self.assertEqual(
                1,
                sum(call["type"] == "legacy-write" for call in fallback["calls"]),
                scenario,
            )
            self.assertEqual("localStorage", fallback["runtimeRecord"]["storage"])
            self.assertEqual("imported", fallback["runtimeRecord"]["source"])
            self.assertEqual("local-unverified", fallback["runtimeRecord"]["trust"])
            self.assertEqual(
                "new complete question",
                fallback["legacy"]["questions"][0]["question"],
                scenario,
            )

        rejected_fallback = payload["rejectedLegacyFallback"]
        self.assertFalse(rejected_fallback["result"]["resolved"])
        self.assertIn("localStorage", rejected_fallback["result"]["message"])
        self.assertEqual(
            "old bundled question",
            rejected_fallback["runtimeRecord"]["questions"][0]["question"],
        )
        self.assertFalse(
            any(
                call["type"] in {"registry", "activate", "detect"}
                for call in rejected_fallback["calls"]
            )
        )

        failed_idb = payload["failedIdbResult"]
        self.assertFalse(failed_idb["result"]["resolved"])
        self.assertFalse(
            any(call["type"] == "legacy-write" for call in failed_idb["calls"])
        )

        for scenario in ("partialAfterQuestions", "partialAfterMetadata"):
            partial = payload[scenario]
            self.assertFalse(partial["result"]["resolved"], scenario)
            self.assertEqual(
                "old legacy question",
                partial["legacy"]["questions"][0]["question"],
                scenario,
            )
            self.assertEqual(
                "Old legacy metadata",
                partial["legacy"]["metadata"]["name"],
                scenario,
            )
            self.assertEqual(
                "old-legacy-lab",
                partial["legacy"]["labs"][0]["id"],
                scenario,
            )
            self.assertEqual(
                "old bundled question",
                partial["runtimeRecord"]["questions"][0]["question"],
                scenario,
            )
            self.assertFalse(
                any(
                    call["type"] in {"registry", "activate", "detect"}
                    for call in partial["calls"]
                ),
                scenario,
            )

        authoritative = payload["authoritativePartialMirror"]
        self.assertTrue(authoritative["result"]["resolved"])
        self.assertEqual(
            "new complete question",
            authoritative["runtimeRecord"]["questions"][0]["question"],
        )
        self.assertEqual(
            "old legacy question",
            authoritative["legacy"]["questions"][0]["question"],
        )
        self.assertEqual(
            "Old legacy metadata",
            authoritative["legacy"]["metadata"]["name"],
        )
        self.assertEqual(
            "old-legacy-lab",
            authoritative["legacy"]["labs"][0]["id"],
        )

    def test_pack_and_image_replacement_is_atomic_across_import_failures(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const managerSource = fs.readFileSync(process.argv[1], 'utf8');

function makeEnvironment({
  imageFailure = null,
  packFailure = false,
  detectFailure = false
} = {}) {
  const calls = [];
  const local = new Map();
  let images = new Map([
    ['old-one.png', { fileName: 'old-one.png', blob: { old: 1 }, mimeType: 'image/png' }],
    ['old-two.png', { fileName: 'old-two.png', blob: { old: 2 }, mimeType: 'image/png' }]
  ]);
  let replaceAttempt = 0;
  const oldRuntime = {
    questions: [{ id: 1, question: 'old pack', options: ['A', 'B'], correct: 0 }],
    labs: [],
    metadata: { name: 'Old pack' },
    source: 'imported',
    trust: 'local-unverified',
    storage: 'indexedDB'
  };
  const localStorage = {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { local.set(key, String(value)); },
    removeItem(key) { local.delete(key); }
  };
  const window = {
    userExams: { atomic: oldRuntime },
    imageStorage: {
      async getAllExamImages(id) {
        calls.push({ type: 'image-snapshot', id });
        return Array.from(images.values());
      },
      async replaceExamImages(id, nextImages) {
        replaceAttempt += 1;
        calls.push({
          type: 'image-replace',
          id,
          names: nextImages.map((image) => image.fileName)
        });
        if (replaceAttempt === 1 && imageFailure) {
          const error = new Error(`${imageFailure} image failure`);
          if (imageFailure === 'quota') error.name = 'QuotaExceededError';
          throw error;
        }
        images = new Map(
          nextImages.map((image) => [
            image.fileName,
            {
              fileName: image.fileName,
              blob: image.blob || { imported: true },
              mimeType: image.mimeType || 'image/png'
            }
          ])
        );
        return images.size;
      }
    },
    ExamApp: {
      STORAGE_KEYS: { exams: 'examplar_exam_registry' },
      normalizeExamId(id) { return String(id || '').trim().toLowerCase(); },
      isSafeExamId(id) { return /^[a-z0-9][a-z0-9-]*$/.test(String(id)); },
      validateExamData() { return { valid: true, errors: [] }; },
      sanitizeExamMetadata(metadata) { return metadata ? { ...metadata } : metadata; },
      addToRegistry() {},
      log() {},
      warn(message) { calls.push({ type: 'warn', message: String(message) }); },
      examStorage: {
        async getExam() {
          return { examId: 'atomic', ...oldRuntime };
        },
        async putExam(id) {
          calls.push({ type: 'pack-write', id });
          if (packFailure) throw new Error('simulated pack failure');
          return true;
        },
        putLegacyExam() {
          calls.push({ type: 'legacy-write' });
          return true;
        },
        legacyQuestionKey(id) { return `custom_${id}_questions`; },
        legacyMetadataKey(id) { return `exam_metadata_${id}`; },
        legacyLabsKey(id) { return `custom_${id}_labs`; }
      }
    }
  };
  window.ExamApp.imageStorage = window.imageStorage;
  const sandbox = {
    window,
    localStorage,
    console: { log() {}, warn() {}, error() {} },
    JSON,
    Map,
    Set,
    Object,
    Array,
    String,
    RegExp,
    Promise
  };
  vm.runInNewContext(managerSource, sandbox, { filename: process.argv[1] });
  const manager = window.ExamApp.examManager;
  manager.activateExam = () => calls.push({ type: 'activate' });
  manager.detectAvailableExams = async () => {
    calls.push({ type: 'detect' });
    if (detectFailure) throw new Error('simulated post-commit refresh failure');
  };
  return {
    window,
    manager,
    calls,
    imageNames() { return Array.from(images.keys()).sort(); }
  };
}

function importedData() {
  return {
    questions: [{ id: 1, question: 'new pack', options: ['A', 'B'], correct: 0 }],
    metadata: { name: 'New pack' }
  };
}

function imageFiles(names) {
  return names.map((fileName) => ({
    fileName,
    buffer: new ArrayBuffer(8)
  }));
}

async function attempt(config, names) {
  const env = makeEnvironment(config);
  let result;
  try {
    result = {
      resolved: await env.manager.importExam(
        'atomic',
        importedData(),
        imageFiles(names),
        { overwrite: true }
      )
    };
  } catch (error) {
    result = {
      resolved: false,
      message: error && error.message,
      name: error && error.name
    };
  }
  return {
    result,
    calls: env.calls,
    images: env.imageNames(),
    question: env.window.userExams.atomic.questions[0].question
  };
}

(async () => {
  console.log(JSON.stringify({
    quota: await attempt({ imageFailure: 'quota' }, ['new.png']),
    midbatch: await attempt({ imageFailure: 'midbatch' }, ['new.png', 'later.png']),
    fewer: await attempt({}, ['new.png']),
    zero: await attempt({}, []),
    packFailure: await attempt({ packFailure: true }, ['new.png']),
    detectFailure: await attempt({ detectFailure: true }, ['new.png'])
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "exam-manager.js",
        )

        for scenario in ("quota", "midbatch"):
            failed = payload[scenario]
            self.assertFalse(failed["result"]["resolved"], scenario)
            self.assertEqual(
                ["old-one.png", "old-two.png"],
                failed["images"],
                scenario,
            )
            self.assertEqual("old pack", failed["question"], scenario)
            self.assertFalse(
                any(call["type"] == "pack-write" for call in failed["calls"]),
                scenario,
            )

        fewer = payload["fewer"]
        self.assertTrue(fewer["result"]["resolved"])
        self.assertEqual(["new.png"], fewer["images"])
        self.assertEqual("new pack", fewer["question"])
        self.assertLess(
            next(
                i
                for i, call in enumerate(fewer["calls"])
                if call["type"] == "image-replace"
            ),
            next(
                i
                for i, call in enumerate(fewer["calls"])
                if call["type"] == "pack-write"
            ),
        )

        zero = payload["zero"]
        self.assertTrue(zero["result"]["resolved"])
        self.assertEqual([], zero["images"])
        self.assertEqual("new pack", zero["question"])

        pack_failure = payload["packFailure"]
        self.assertFalse(pack_failure["result"]["resolved"])
        self.assertEqual(["old-one.png", "old-two.png"], pack_failure["images"])
        self.assertEqual("old pack", pack_failure["question"])
        self.assertEqual(
            2,
            sum(
                call["type"] == "image-replace"
                for call in pack_failure["calls"]
            ),
        )

        detect_failure = payload["detectFailure"]
        self.assertTrue(detect_failure["result"]["resolved"])
        self.assertEqual(["new.png"], detect_failure["images"])
        self.assertEqual("new pack", detect_failure["question"])
        self.assertTrue(
            any(
                call["type"] == "warn"
                and "refresh" in call["message"].lower()
                for call in detect_failure["calls"]
            )
        )

    def test_storage_and_loader_treat_all_browser_records_as_unverified_imports(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const storageSource = fs.readFileSync(process.argv[1], 'utf8');
const loaderSource = fs.readFileSync(process.argv[2], 'utf8');

async function exerciseStorage() {
  const local = new Map();
  const warnings = [];
  const window = {
    indexedDB: null,
    ExamApp: {
      STORAGE_KEYS: { exams: 'examplar_exam_registry' },
      isSafeExamId() { return true; },
      addToRegistry() { throw new Error('simulated registry failure'); },
      warn(message) { warnings.push(String(message)); }
    }
  };
  const sandbox = {
    window,
    localStorage: {
      getItem(key) { return local.has(key) ? local.get(key) : null; },
      setItem(key, value) { local.set(key, String(value)); },
      removeItem(key) { local.delete(key); }
    },
    console: { warn() {}, error() {}, log() {} },
    Promise,
    Map,
    Set,
    JSON,
    Date
  };
  vm.runInNewContext(storageSource, sandbox);
  const storage = new window.ExamApp.ExamStorage();
  let persisted = null;
  storage.putRecord = async (_storeName, record) => {
    persisted = record;
    return true;
  };
  await storage.putExam(
    'forged',
    [{ id: 1, question: 'Q' }],
    { name: 'Forged', source: 'bundled', trust: 'bundled' },
    { labs: [], source: 'bundled', trust: 'bundled' }
  );
  storage.getRecord = async () => ({
    examId: 'forged',
    questions: [{ id: 1, question: 'raw stored' }],
    metadata: {
      name: 'Raw stored',
      source: 'bundled',
      trust: 'bundled',
      pro: { url: 'https://evil.example/buy' }
    },
    source: 'bundled',
    trust: 'bundled'
  });
  const loaded = await storage.getExam('forged', { migrateLegacy: false });

  sandbox.localStorage.setItem(
    'custom_legacy_questions',
    JSON.stringify([{ id: 1, question: 'legacy' }])
  );
  sandbox.localStorage.setItem(
    'exam_metadata_legacy',
    JSON.stringify({ name: 'Legacy', source: 'bundled', trust: 'bundled' })
  );
  const legacy = storage.getLegacyExam('legacy');
  return { persisted, loaded, legacy, warnings };
}

async function exerciseLoader() {
  const forgedMetadata = {
    name: 'Forged',
    source: 'bundled',
    trust: 'bundled',
    pro: { url: 'https://evil.example/buy' },
    recommendedPro: { url: 'https://evil.example/upgrade' }
  };
  const questions = [{ id: 1, question: 'Q', options: ['A', 'B'], correct: 0 }];
  const storageReads = [];
  const window = {
    ExamApp: {
      userExams: {},
      isSafeExamId(id) { return /^[a-z0-9-]+$/.test(String(id)); },
      validateExamData() { return { valid: true, errors: [] }; },
      log() {},
      warn() {},
      examStorage: {
        async listExamIds() { return ['overridden']; },
        async listProgressExamIds() { return []; },
        async getExam(id) {
          storageReads.push(id);
          return {
            examId: id,
            questions,
            labs: [],
            metadata: forgedMetadata,
            source: 'bundled',
            trust: 'bundled',
            storage: 'forged'
          };
        }
      }
    }
  };
  const fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/index.json')) {
      return { ok: true, async json() { return ['bundle-only', 'overridden']; } };
    }
    if (value.endsWith('/metadata.json')) {
      return { ok: true, async json() { return { ...forgedMetadata }; } };
    }
    throw new Error(`unexpected fetch: ${value}`);
  };
  const sandbox = {
    window,
    fetch,
    console: { warn() {}, error() {}, log() {} },
    Promise,
    Map,
    Set,
    JSON,
    Object,
    Array,
    String,
    RegExp
  };
  vm.runInNewContext(loaderSource, sandbox);
  await window.ExamApp.examsLoadedPromise;
  return {
    bundle: window.userExams['bundle-only'],
    overridden: window.userExams.overridden,
    storageReads
  };
}

(async () => {
  console.log(JSON.stringify({
    storage: await exerciseStorage(),
    loader: await exerciseLoader()
  }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "exam-storage.js",
            ROOT / "assets" / "js" / "exam-loader.js",
        )

        for record in (
            payload["storage"]["persisted"],
            payload["storage"]["loaded"],
            payload["storage"]["legacy"],
            payload["loader"]["overridden"],
        ):
            self.assertEqual("imported", record["source"])
            self.assertEqual("local-unverified", record["trust"])

        self.assertTrue(
            any(
                "registry" in warning.lower()
                for warning in payload["storage"]["warnings"]
            )
        )
        self.assertEqual([], payload["storage"]["persisted"]["labs"])

        bundled = payload["loader"]["bundle"]
        self.assertEqual("bundled", bundled["source"])
        self.assertEqual("bundled", bundled["trust"])
        self.assertIn("pro", bundled["metadata"])
        self.assertIn("recommendedPro", bundled["metadata"])

        for record in (payload["loader"]["bundle"], payload["loader"]["overridden"]):
            self.assertNotIn("source", record["metadata"])
            self.assertNotIn("trust", record["metadata"])

        imported_metadata = payload["loader"]["overridden"]["metadata"]
        self.assertNotIn("pro", imported_metadata)
        self.assertNotIn("recommendedPro", imported_metadata)

    def test_roadmap_storage_metadata_keeps_local_provenance_and_official_links_only(self):
        node_script = r"""
const fs = require('fs');
const vm = require('vm');
const roadmapSource = fs.readFileSync(process.argv[1], 'utf8');
const utilsSource = fs.readFileSync(process.argv[2], 'utf8');
const helperStart = roadmapSource.indexOf('function escapeHtml');
const helperEnd = roadmapSource.indexOf('function resolveEntry', helperStart);
const mergeStart = roadmapSource.indexOf('function mergeStoredRoadmapMetadata');
const mergeEnd = roadmapSource.indexOf('const state =', mergeStart);
const detailsStart = roadmapSource.indexOf('function detailsMarkup');
const detailsEnd = roadmapSource.indexOf('function renderNode', detailsStart);
const helperFound = [
  helperStart,
  helperEnd,
  mergeStart,
  mergeEnd,
  detailsStart,
  detailsEnd
].every((index) => index >= 0);
if (!helperFound) {
  console.log(JSON.stringify({ helperFound: false }));
  process.exit(0);
}

const sandbox = {
  window: {
    ExamApp: {},
    location: {
      origin: 'https://examplar.app',
      href: 'https://examplar.app/roadmaps',
      hostname: 'examplar.app',
      search: ''
    }
  },
  document: {
    createElement() { return { appendChild() {}, innerHTML: '' }; },
    createTextNode(value) { return { value }; }
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  URL,
  URLSearchParams,
  console: { log() {}, warn() {}, error() {} }
};
vm.createContext(sandbox);
vm.runInContext(utilsSource, sandbox, { filename: 'utils.js' });
vm.runInContext(
  roadmapSource.slice(helperStart, helperEnd)
    + roadmapSource.slice(mergeStart, mergeEnd)
    + 'function progressStats() { return null; }'
    + roadmapSource.slice(detailsStart, detailsEnd)
    + `
      const imported = mergeStoredRoadmapMetadata(
        {
          name: 'Bundled preview',
          resources: [{ name: 'Old', url: 'https://learn.microsoft.com/old' }]
        },
        {
          source: 'bundled',
          trust: 'bundled',
          metadata: {
            name: 'Imported complete',
            source: 'bundled',
            trust: 'bundled',
            resources: [
              { name: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/azure/' },
              { name: 'Forged', url: 'https://evil.example/roadmap' }
            ]
          }
        }
      );
      const bundled = {
        source: 'bundled',
        trust: 'bundled',
        resources: [{ name: 'Bundled external', url: 'https://example.com/reference' }]
      };
      result = {
        helperFound: true,
        imported,
        importedHtml: detailsMarkup({ meta: imported, progress: null }),
        bundledHtml: detailsMarkup({ meta: bundled, progress: null })
      };
    `,
  sandbox
);
console.log(JSON.stringify(sandbox.result));
"""
        payload = self._run_node(
            node_script,
            ROOT / "assets" / "js" / "roadmaps.js",
            ROOT / "assets" / "js" / "utils.js",
        )

        self.assertTrue(payload["helperFound"])
        self.assertEqual("imported", payload["imported"]["source"])
        self.assertEqual("local-unverified", payload["imported"]["trust"])
        self.assertIn(
            'href="https://learn.microsoft.com/en-us/azure/"',
            payload["importedHtml"],
        )
        self.assertNotIn("evil.example", payload["importedHtml"])
        self.assertIn(
            'href="https://example.com/reference"',
            payload["bundledHtml"],
        )


if __name__ == "__main__":
    unittest.main()
