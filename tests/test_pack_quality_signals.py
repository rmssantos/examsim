import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

spec = importlib.util.spec_from_file_location(
    "validate_exam_packs_quality", ROOT / "tools" / "validate-exam-packs.py"
)
vep = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = vep
spec.loader.exec_module(vep)


def _standard(i, correct, explanation="A sufficiently detailed explanation of why the key is right here."):
    return {"id": i, "question_type": "STANDARD", "question": f"Question {i}?",
            "options": ["a", "b", "c", "d"], "correct": correct, "explanation": explanation}


class AnswerPositionSignalTests(unittest.TestCase):
    def test_balanced_pack_is_clean(self):
        questions = [_standard(i, i % 4) for i in range(40)]
        self.assertEqual(vep.answer_position_issue_count(questions), 0)

    def test_concentrated_position_is_flagged(self):
        questions = [_standard(i, 0) for i in range(40)]
        self.assertGreater(vep.answer_position_issue_count(questions), 0)

    def test_dead_position_is_flagged(self):
        questions = [_standard(i, i % 3) for i in range(30)]  # index 3 never keyed
        self.assertGreater(vep.answer_position_issue_count(questions), 0)

    def test_tiny_pack_is_ignored(self):
        questions = [_standard(i, 0) for i in range(10)]
        self.assertEqual(vep.answer_position_issue_count(questions), 0)


class PositionalLanguageSignalTests(unittest.TestCase):
    def test_position_reference_is_flagged(self):
        q = _standard(1, 0, explanation="The first option is correct because it fits.")
        self.assertEqual(vep.positional_language_issue_count([q]), 1)

    def test_order_dependent_option_is_flagged(self):
        q = _standard(2, 3)
        q["options"][3] = "All of the above"
        self.assertEqual(vep.positional_language_issue_count([q]), 1)

    def test_content_referencing_text_is_clean(self):
        q = _standard(3, 1, explanation="The managed option is right; the self-hosted one is not.")
        self.assertEqual(vep.positional_language_issue_count([q]), 0)

    def test_sequence_positional_wording_is_not_flagged(self):
        # SEQUENCE keeps source order in the app, so ordering words are legitimate there.
        seq = {"id": 4, "question_type": "SEQUENCE", "question": "Order these.",
               "options": ["a", "b"], "correct": [0, 1],
               "explanation": "The first option comes before the second."}
        self.assertEqual(vep.positional_language_issue_count([seq]), 0)


class ExplanationDepthSignalTests(unittest.TestCase):
    def test_thin_and_missing_explanations_are_counted(self):
        questions = [
            _standard(1, 0),                                  # fine
            _standard(2, 1, explanation="Too short."),        # thin
            _standard(3, 2, explanation=""),                  # missing
        ]
        self.assertEqual(vep.short_explanation_count(questions), 2)


if __name__ == "__main__":
    unittest.main()
