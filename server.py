#!/usr/bin/env python3
"""
Simple HTTP Server for Exam Simulator
Runs locally to bypass file:// protocol limitations
"""
import http.server
import socketserver
import os
import sys
import webbrowser
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json
import re

PORT = 8000
HOST = "127.0.0.1"
DIRECTORY = Path(__file__).parent
ALLOWED_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'}

def safe_join_under(root, *parts):
    root_path = Path(root).resolve()
    target = root_path.joinpath(*parts).resolve()
    target.relative_to(root_path)
    return target

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def end_headers(self):
        # Only allow requests from the same origin (localhost)
        origin = (self.headers.get('Origin', '') or '').replace('\r', '').replace('\n', '')
        port = self.server.server_address[1]
        localhost_origin = f'http://localhost:{port}'
        loopback_origin = f'http://127.0.0.1:{port}'
        if origin == loopback_origin:
            self.send_header('Access-Control-Allow-Origin', loopback_origin)
        elif origin == localhost_origin or not origin:
            self.send_header('Access-Control-Allow-Origin', localhost_origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def send_json(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/user-content/exams/index.json':
            exams_root = DIRECTORY / 'user-content' / 'exams'
            exam_dirs = []
            if exams_root.exists():
                for child in sorted(exams_root.iterdir(), key=lambda item: item.name.lower()):
                    if child.is_dir() and re.fullmatch(r'[A-Za-z0-9_\-]+', child.name) and (child / 'dump.json').is_file():
                        exam_dirs.append(child.name)
            self.send_json(200, exam_dirs)
            return

        super().do_GET()

    def do_PUT(self):
        parsed = urlparse(self.path)

        if parsed.path != '/__upload_images':
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'Not Found')
            return

        qs = parse_qs(parsed.query)
        exam = (qs.get('exam', [''])[0] or '').strip()
        name = (qs.get('name', [''])[0] or '').strip()

        # Basic sanitization to avoid path traversal
        if not exam or not re.fullmatch(r'[A-Za-z0-9_\-]+', exam):
            self.send_json(400, {'error': 'Invalid exam id'})
            return

        safe_name = os.path.basename(name.replace('\\', '/'))
        if (
            not safe_name or
            safe_name != name or
            safe_name.startswith('.') or
            not re.fullmatch(r'[A-Za-z0-9_. -]+', safe_name)
        ):
            self.send_json(400, {'error': 'Invalid filename'})
            return

        extension = Path(safe_name).suffix.lower()
        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            self.send_json(400, {'error': 'Unsupported image extension'})
            return

        try:
            content_length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            self.send_json(400, {'error': 'Invalid content length'})
            return

        max_size = 50 * 1024 * 1024  # 50 MB
        if content_length <= 0:
            self.send_json(400, {'error': 'Empty upload'})
            return

        if content_length > max_size:
            self.send_json(413, {'error': 'File too large. Maximum size is 50 MB.'})
            return
        data = self.rfile.read(content_length) if content_length > 0 else b''

        try:
            base_exam_dir = safe_join_under(DIRECTORY / 'user-content' / 'exams', exam)
            dest_dir = safe_join_under(base_exam_dir, 'images')
            dest_path = safe_join_under(dest_dir, safe_name)
        except ValueError:
            self.send_json(400, {'error': 'Invalid upload path'})
            return

        dest_dir.mkdir(parents=True, exist_ok=True)

        try:
            dest_path.write_bytes(data)
        except OSError:
            self.send_json(500, {'error': 'Could not save uploaded image'})
            return

        self.send_json(200, {'filename': safe_name})

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
    except:
        print("Could not open browser automatically")
        print(f"Please open: http://{HOST}:{PORT}/")

    # Start server
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((HOST, PORT), MyHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped. Goodbye!")
            sys.exit(0)

if __name__ == "__main__":
    main()
