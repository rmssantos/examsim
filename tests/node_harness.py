"""Shared helpers for tests that execute browser JavaScript with Node."""

import json
import shutil
import subprocess
import textwrap
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def run_node_snippet(
    script_path: Path,
    node_script: str,
    *,
    timeout: float = 5,
) -> Any:
    """Run a Node snippet against one source file and decode its JSON output."""
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("node not available")

    try:
        result = subprocess.run(
            [node, "-e", node_script, str(script_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=ROOT,
        )
    except subprocess.CalledProcessError as error:
        details = (error.stderr or error.stdout or str(error)).strip()
        raise AssertionError(
            f"Node snippet failed for {script_path}:\n{details}"
        ) from error

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(
            f"Node snippet returned invalid JSON for {script_path}:\n"
            f"{result.stdout}\n{result.stderr}"
        ) from error


def utils_bootstrap(assertions: str) -> str:
    """Build a Node script with the browser globals required by utils.js."""
    return textwrap.dedent(
        f"""
        const fs = require('fs');
        const vm = require('vm');
        global.window = {{
          location: {{ hostname: 'localhost', search: '', href: 'http://localhost/' }}
        }};
        global.document = {{
          createElement() {{ return {{ appendChild() {{}}, innerHTML: '' }}; }},
          createTextNode(value) {{ return {{ value }}; }}
        }};
        global.localStorage = {{
          getItem() {{ return null; }},
          setItem() {{}},
          removeItem() {{}}
        }};
        vm.runInThisContext(fs.readFileSync('assets/js/utils.js', 'utf8'));
        {assertions}
        """
    )
