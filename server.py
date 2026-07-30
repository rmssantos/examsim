#!/usr/bin/env python3
"""
Simple HTTP Server for Exam Simulator
Runs locally to bypass file:// protocol limitations
"""
import http.server
import hmac
import socketserver
import os
import secrets
import sys
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs, parse_qsl, unquote, urlencode
import json
import re

PORT = 8000
HOST = "127.0.0.1"
DIRECTORY = Path(__file__).parent
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
CLEAN_ROUTES = {
    '/editor': '/editor.html',
    '/exam': '/exam.html',
    '/study': '/exam.html',
    '/privacy-and-storage': '/privacy-and-storage.html',
    '/roadmaps': '/roadmaps.html',
}
CLEAN_ROUTE_REDIRECTS = {
    '/editor/': '/editor',
    '/exam/': '/exam',
    '/study/': '/study',
    '/privacy-and-storage/': '/privacy-and-storage',
    '/roadmaps/': '/roadmaps',
}

def looks_like_supported_image(extension, data):
    if extension in {'.jpg', '.jpeg'}:
        return data.startswith(b'\xff\xd8\xff')
    if extension == '.png':
        return data.startswith(b'\x89PNG\r\n\x1a\n')
    if extension == '.gif':
        return data.startswith((b'GIF87a', b'GIF89a'))
    if extension == '.webp':
        return len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    return False

def safe_join_under(root, *parts):
    root_path = Path(root).resolve()
    target = root_path.joinpath(*parts).resolve()
    target.relative_to(root_path)
    return target

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def route_static_path(self, path):
        parsed = urlparse(path)
        normalized_path = parsed.path.rstrip('/') or '/'
        target = CLEAN_ROUTES.get(normalized_path)
        if not target:
            return path
        return target + (f'?{parsed.query}' if parsed.query else '')

    def translate_path(self, path):
        return super().translate_path(self.route_static_path(path))

    def end_headers(self):
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def send_json(self, status, payload, cors_origin=None):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        if cors_origin:
            self.send_header('Access-Control-Allow-Origin', cors_origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(body)

    def validated_host(self):
        values = self.headers.get_all('Host', [])
        if len(values) != 1:
            return None

        host = values[0].strip().lower()
        port = self.server.server_address[1]
        allowed_hosts = {
            f'127.0.0.1:{port}',
            f'localhost:{port}',
        }
        return host if host in allowed_hosts else None

    def validated_origin(self, host, required):
        values = self.headers.get_all('Origin', [])
        if not values:
            return (not required, None)
        if len(values) != 1:
            return (False, None)

        origin = values[0].strip()
        expected_origin = f'http://{host}'
        if origin != expected_origin:
            return (False, None)
        return (True, origin)

    def reject_invalid_host(self):
        self.send_json(421, {'error': 'Misdirected request'})

    def reject_forbidden(self):
        self.send_json(403, {'error': 'Forbidden'})

    def is_public_static_path(self, path):
        parsed = urlparse(path)
        try:
            decoded_path = unquote(parsed.path, errors='strict')
        except UnicodeError:
            return False
        if '\x00' in decoded_path:
            return False

        segments = decoded_path.replace('\\', '/').split('/')
        return all(not segment.startswith('.') for segment in segments if segment)

    def validate_static_request(self):
        if self.validated_host() is None:
            self.reject_invalid_host()
            return False
        if not self.is_public_static_path(self.path):
            self.send_error(404, 'Not found')
            return False
        return True

    def do_OPTIONS(self):
        host = self.validated_host()
        if host is None:
            self.reject_invalid_host()
            return

        parsed = urlparse(self.path)
        if parsed.path != '/__upload_images':
            self.send_json(404, {'error': 'Not found'})
            return

        origin_is_valid, origin = self.validated_origin(host, required=True)
        if not origin_is_valid:
            self.reject_forbidden()
            return

        requested_methods = self.headers.get_all('Access-Control-Request-Method', [])
        if len(requested_methods) != 1 or requested_methods[0].strip().upper() != 'PUT':
            self.send_json(405, {'error': 'Method not allowed'})
            return

        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Examplar-CSRF-Token')
        self.end_headers()

    def do_GET(self):
        if not self.validate_static_request():
            return

        parsed = urlparse(self.path)
        if parsed.path == '/__upload_session':
            host = self.validated_host()

            origin_is_valid, origin = self.validated_origin(host, required=False)
            if not origin_is_valid:
                self.reject_forbidden()
                return

            token = getattr(self.server, 'csrf_token', None)
            if not isinstance(token, str) or not token:
                self.send_json(503, {'error': 'Upload session unavailable'})
                return

            self.send_json(200, {'csrfToken': token}, cors_origin=origin)
            return

        redirect_path = CLEAN_ROUTE_REDIRECTS.get(parsed.path)
        if redirect_path:
            try:
                query_pairs = parse_qsl(parsed.query, keep_blank_values=True, max_num_fields=100)
            except ValueError:
                self.send_response(400)
                self.end_headers()
                return

            safe_query = urlencode(query_pairs, doseq=True)
            location = redirect_path + (f'?{safe_query}' if safe_query else '')
            if not re.fullmatch(r'/[A-Za-z0-9._~/?=&%+-]*', location):
                self.send_response(400)
                self.end_headers()
                return

            self.send_response(302)
            self.send_header('Location', location)
            self.end_headers()
            return

        if parsed.path == '/user-content/exams/index.json':
            exams_root = DIRECTORY / 'user-content' / 'exams'
            exam_dirs = []
            if exams_root.exists():
                for child in sorted(exams_root.iterdir(), key=lambda item: item.name.lower()):
                    if child.is_dir() and re.fullmatch(r'[A-Za-z0-9_\-]+', child.name) and (child / 'dump.json').is_file():
                        exam_dirs.append(child.name)
            self.send_json(200, exam_dirs)
            return

        self.path = self.route_static_path(self.path)

        super().do_GET()

    def do_HEAD(self):
        if not self.validate_static_request():
            return
        self.path = self.route_static_path(self.path)
        super().do_HEAD()

    def do_PUT(self):
        parsed = urlparse(self.path)

        host = self.validated_host()
        if host is None:
            self.reject_invalid_host()
            return

        if parsed.path != '/__upload_images':
            self.send_json(404, {'error': 'Not found'})
            return

        origin_is_valid, origin = self.validated_origin(host, required=True)
        if not origin_is_valid:
            self.reject_forbidden()
            return

        expected_token = getattr(self.server, 'csrf_token', None)
        provided_tokens = self.headers.get_all('X-Examplar-CSRF-Token', [])
        if not isinstance(expected_token, str) or not expected_token:
            self.send_json(503, {'error': 'Upload session unavailable'})
            return
        if (
            len(provided_tokens) != 1
            or not hmac.compare_digest(
                provided_tokens[0].encode('utf-8'),
                expected_token.encode('utf-8'),
            )
        ):
            self.reject_forbidden()
            return

        qs = parse_qs(parsed.query)
        exam = (qs.get('exam', [''])[0] or '').strip()
        name = (qs.get('name', [''])[0] or '').strip()

        # Basic sanitization to avoid path traversal
        if not exam or not re.fullmatch(r'[A-Za-z0-9_\-]+', exam):
            self.send_json(400, {'error': 'Invalid exam id'}, cors_origin=origin)
            return

        safe_name = os.path.basename(name.replace('\\', '/'))
        if (
            not safe_name or
            safe_name != name or
            safe_name.startswith('.') or
            not re.fullmatch(r'[A-Za-z0-9_. -]+', safe_name)
        ):
            self.send_json(400, {'error': 'Invalid filename'}, cors_origin=origin)
            return

        extension = Path(safe_name).suffix.lower()
        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            self.send_json(400, {'error': 'Unsupported image extension'}, cors_origin=origin)
            return

        try:
            content_length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            self.send_json(400, {'error': 'Invalid content length'}, cors_origin=origin)
            return

        if content_length <= 0:
            self.send_json(400, {'error': 'Empty upload'}, cors_origin=origin)
            return

        if content_length > MAX_UPLOAD_SIZE:
            self.send_json(413, {'error': 'File too large. Maximum size is 10 MB.'}, cors_origin=origin)
            return
        data = self.rfile.read(content_length) if content_length > 0 else b''

        if not looks_like_supported_image(extension, data):
            self.send_json(400, {'error': 'Invalid image content'}, cors_origin=origin)
            return

        try:
            base_exam_dir = safe_join_under(DIRECTORY / 'user-content' / 'exams', exam)
            dest_dir = safe_join_under(base_exam_dir, 'images')
            dest_path = safe_join_under(dest_dir, safe_name)
        except ValueError:
            self.send_json(400, {'error': 'Invalid upload path'}, cors_origin=origin)
            return

        dest_dir.mkdir(parents=True, exist_ok=True)

        try:
            dest_path.write_bytes(data)
        except OSError:
            self.send_json(500, {'error': 'Could not save uploaded image'}, cors_origin=origin)
            return

        self.send_json(200, {'filename': safe_name}, cors_origin=origin)

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    os.chdir(DIRECTORY)

    print("=" * 60)
    print("Exam Simulator - Local Server")
    print("=" * 60)
    print(f"Serving from: {DIRECTORY}")
    print(f"Server running at: http://{HOST}:{PORT}")
    print("=" * 60)
    print("\nOpening browser...")
    print("\nPress Ctrl+C to stop the server\n")

    # Try to open browser
    try:
        webbrowser.open(f"http://{HOST}:{PORT}/")
    except Exception:
        print("Could not open browser automatically")
        print(f"Please open: http://{HOST}:{PORT}/")

    # Start server
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((HOST, PORT), MyHTTPRequestHandler) as httpd:
        httpd.csrf_token = secrets.token_urlsafe(32)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped. Goodbye!")
            sys.exit(0)

if __name__ == "__main__":
    main()
