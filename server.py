#!/usr/bin/env python3
"""
Simple HTTP Server for Azure AI Exam Simulator
Runs locally to bypass file:// protocol limitations
"""
import http.server
import socketserver
import os
import sys
import webbrowser
from pathlib import Path

PORT = 8000
DIRECTORY = Path(__file__).parent

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def end_headers(self):
        # Add CORS headers to allow everything
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        # Custom log format
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    os.chdir(DIRECTORY)

    print("=" * 60)
    print("Azure AI Exam Simulator - Local Server")
    print("=" * 60)
    print(f"Serving from: {DIRECTORY}")
    print(f"Server running at: http://localhost:{PORT}")
    print("=" * 60)
    print("\nOpening browser...")
    print("\nPress Ctrl+C to stop the server\n")

    # Try to open browser
    try:
        webbrowser.open(f"http://localhost:{PORT}/")
    except:
        print("Could not open browser automatically")
        print(f"Please open: http://localhost:{PORT}/")

    # Start server
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped. Goodbye!")
            sys.exit(0)

if __name__ == "__main__":
    main()
