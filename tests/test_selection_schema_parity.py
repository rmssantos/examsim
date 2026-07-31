"""Browser/CLI parity checks for selection-question schema validation."""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet, utils_bootstrap
except ImportError:
    from node_harness import run_node_snippet, utils_bootstrap


ROOT = Path(__file__).resolve().parents[1]


def validate_in_browser(question: dict) -> dict:
    script = utils_bootstrap(
        f"""
        const question = JSON.parse({json.dumps(json.dumps(question))});
        console.log(JSON.stringify(window.ExamApp.validateExamData([question])));
        """
    )
    return run_node_snippet(
        ROOT / "assets/js/utils.js",
        script,
        timeout=15,
    )


def validate_with_cli(question: dict) -> subprocess.CompletedProcess:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "exams"
        exam_dir = root / "selection"
        exam_dir.mkdir(parents=True)
        (root / "index.json").write_text(
            json.dumps(["selection"]),
            encoding="utf-8",
        )
        (exam_dir / "metadata.json").write_text(
            json.dumps(
                {
                    "id": "selection",
                    "name": "Selection",
                    "questionCount": 1,
                    "totalQuestions": 1,
                }
            ),
            encoding="utf-8",
        )
        (exam_dir / "dump.json").write_text(
            json.dumps([question]),
            encoding="utf-8",
        )
        return subprocess.run(
            [
                sys.executable,
                "tools/validate-exam-packs.py",
                "--root",
                str(root),
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )


class SelectionSchemaParityTests(unittest.TestCase):
    def assert_accepted_by_browser_and_cli(self, question: dict) -> None:
        browser = validate_in_browser(question)
        cli = validate_with_cli(question)

        self.assertTrue(browser["valid"], browser)
        self.assertEqual(cli.returncode, 0, cli.stdout)

    def assert_rejected_by_browser_and_cli(self, question: dict, message: str) -> None:
        browser = validate_in_browser(question)
        cli = validate_with_cli(question)

        self.assertFalse(browser["valid"], browser)
        self.assertTrue(
            any(message in error.lower() for error in browser["errors"]),
            browser,
        )
        self.assertNotEqual(cli.returncode, 0, cli.stdout)
        self.assertIn(message, cli.stdout.lower())

    def test_multi_and_drag_drop_reject_duplicate_correct_indices(self):
        for question_type in ("MULTI", "DRAG_DROP_SELECT"):
            with self.subTest(question_type=question_type):
                question = {
                    "id": f"duplicate-{question_type.lower()}",
                    "question_type": question_type,
                    "question": "Select two options.",
                    "options": ["A", "B", "C"],
                    "correct": [0, 0],
                }
                if question_type == "DRAG_DROP_SELECT":
                    question["drag_select_required"] = 2

                self.assert_rejected_by_browser_and_cli(question, "duplicate")

    def test_drag_drop_requires_integer_selection_count_matching_correct_length(self):
        valid = {
            "id": "valid-drag",
            "question_type": "DRAG_DROP_SELECT",
            "question": "Select two options.",
            "options": ["A", "B", "C"],
            "correct": [0, 2],
            "drag_select_required": 2,
        }
        self.assert_accepted_by_browser_and_cli(valid)

        invalid_cases = {
            "missing": {
                key: value
                for key, value in valid.items()
                if key != "drag_select_required"
            },
            "boolean": {**valid, "drag_select_required": True},
            "wrong correct length": {**valid, "drag_select_required": 1},
            "outside options": {**valid, "drag_select_required": 4},
        }
        for name, question in invalid_cases.items():
            with self.subTest(case=name):
                self.assert_rejected_by_browser_and_cli(
                    question,
                    "drag_select_required",
                )

    def test_optional_explanation_and_module_require_bounded_text(self):
        base = {
            "id": "bounded-text",
            "question_type": "STANDARD",
            "question": "Choose one option.",
            "options": ["A", "B"],
            "correct": 0,
        }
        invalid_cases = {
            "empty explanation": (
                {**base, "explanation": "   "},
                "explanation",
            ),
            "oversized module": (
                {**base, "module": "m" * 201},
                "module",
            ),
        }

        for name, (question, message) in invalid_cases.items():
            with self.subTest(case=name):
                self.assert_rejected_by_browser_and_cli(question, message)

    def test_question_references_require_non_empty_bounded_strings(self):
        base = {
            "id": "bounded-reference",
            "question_type": "STANDARD",
            "question": "Choose one option.",
            "options": ["A", "B"],
            "correct": 0,
        }
        self.assert_rejected_by_browser_and_cli(
            {**base, "references": None},
            "references",
        )
        for reference in ("   ", 42, "r" * 5001):
            with self.subTest(reference=repr(reference)[:40]):
                self.assert_rejected_by_browser_and_cli(
                    {**base, "references": [reference]},
                    "reference 1",
                )

    def test_sequence_with_mixed_correct_types_is_rejected_without_cli_crash(self):
        question = {
            "id": "mixed-sequence",
            "question_type": "SEQUENCE",
            "question": "Order the options.",
            "options": ["A", "B"],
            "correct": [0, "a"],
        }

        self.assert_rejected_by_browser_and_cli(question, "permutation")


if __name__ == "__main__":
    unittest.main()
