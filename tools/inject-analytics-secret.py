#!/usr/bin/env python3
"""Inject the App Insights connection string into the published analytics asset."""

import json
import os
from pathlib import Path

PLACEHOLDER = "'__APPINSIGHTS_CONNECTION_STRING__'"
DEFAULT_ANALYTICS_PATH = "assets/js/analytics.js"


def main() -> int:
    connection_string = os.environ.get("APPINSIGHTS_CONNECTION_STRING")
    if not connection_string:
        raise SystemExit("Missing APPINSIGHTS_CONNECTION_STRING environment variable")

    analytics_path = Path(os.environ.get("ANALYTICS_JS_PATH", DEFAULT_ANALYTICS_PATH))
    text = analytics_path.read_text(encoding="utf-8")
    if PLACEHOLDER not in text:
        raise SystemExit("analytics placeholder not found")

    connection_string_literal = json.dumps(connection_string)
    analytics_path.write_text(text.replace(PLACEHOLDER, connection_string_literal), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
