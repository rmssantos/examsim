import json
import textwrap
import unittest
from pathlib import Path

try:
    from .node_harness import run_node_snippet
except ImportError:  # Direct execution from the tests directory.
    from node_harness import run_node_snippet


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "assets" / "js" / "script-multi-exam.js"


def evaluate_answer_cases(cases):
    assertions = ",\n".join(
        "  simulator.isAnswerCorrect(" + json.dumps(question) + ", "
        + json.dumps(answer) + ")"
        for question, answer in cases
    )
    return run_node_snippet(
        RUNTIME,
        textwrap.dedent(
            f"""
            const fs = require('fs');
            const vm = require('vm');
            global.window = {{
              ExamApp: {{
                normalizeQuestionType(question) {{
                  return String(question.question_type || '').toUpperCase();
                }}
              }},
              addEventListener() {{}},
              location: {{ search: '' }}
            }};
            global.document = {{
              body: {{ dataset: {{}} }},
              addEventListener() {{}},
              getElementById() {{ return null; }},
              querySelector() {{ return null; }},
              querySelectorAll() {{ return []; }}
            }};
            global.localStorage = {{
              getItem() {{ return null; }},
              setItem() {{}},
              length: 0
            }};
            global.sessionStorage = {{ getItem() {{ return null; }}, removeItem() {{}} }};

            const source = fs.readFileSync(process.argv[1], 'utf8')
              + '\\nglobalThis.__MultiExamSimulator = MultiExamSimulator;';
            vm.runInThisContext(source);
            const simulator = Object.create(globalThis.__MultiExamSimulator.prototype);
            console.log(JSON.stringify([
            {assertions}
            ]));
            """
        ),
    )


class AnswerValidationTests(unittest.TestCase):
    def test_multi_selection_remains_order_independent(self):
        question = {
            "question_type": "MULTI",
            "correct": [0, 1],
        }

        actual = evaluate_answer_cases(
            [
                (question, [1, 0]),
                (question, [0, 0]),
            ]
        )

        self.assertEqual(actual, [True, False])

    def test_drag_drop_selection_is_order_independent(self):
        question = {
            "question_type": "DRAG_DROP_SELECT",
            "correct": [0, 1],
        }

        actual = evaluate_answer_cases(
            [
                (question, [1, 0]),
                (question, [0, 1]),
                (question, [0]),
                (question, [0, 1, 2]),
                (question, [0, 0]),
            ]
        )

        self.assertEqual(actual, [True, True, False, False, False])

    def test_sequence_remains_order_dependent(self):
        question = {
            "question_type": "SEQUENCE",
            "correct": [0, 1],
        }

        actual = evaluate_answer_cases(
            [
                (question, [0, 1]),
                (question, [1, 0]),
            ]
        )

        self.assertEqual(actual, [True, False])

    def test_yes_no_matrix_remains_position_dependent(self):
        question = {
            "question_type": "YES_NO_MATRIX",
            "correct": [0, 1],
        }

        actual = evaluate_answer_cases(
            [
                (question, [0, 1]),
                (question, [1, 0]),
            ]
        )

        self.assertEqual(actual, [True, False])


if __name__ == "__main__":
    unittest.main()
