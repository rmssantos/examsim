#!/usr/bin/env python3
"""Validate ExamSim exam packs without external dependencies."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


EXAM_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
IMAGE_NAME_RE = re.compile(r"^[A-Za-z0-9_. -]{1,128}$")
SUPPORTED_TYPES = {"STANDARD", "MULTI", "YES_NO_MATRIX", "SEQUENCE", "DRAG_DROP_SELECT"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@dataclass
class ValidationIssue:
    path: Path
    message: str

    def format(self, root: Path) -> str:
        try:
            rel = self.path.relative_to(root)
        except ValueError:
            rel = self.path
        return f"{rel}: {self.message}"


class PackValidator:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.issues: list[ValidationIssue] = []
        self.pack_count = 0
        self.question_count = 0

    def add_issue(self, path: Path, message: str) -> None:
        self.issues.append(ValidationIssue(path, message))

    def load_json(self, path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            self.add_issue(path, "missing file")
        except json.JSONDecodeError as error:
            self.add_issue(path, f"invalid JSON: {error.msg} at line {error.lineno}, column {error.colno}")
        except OSError as error:
            self.add_issue(path, f"could not read file: {error}")
        return None

    def discover_exam_ids(self) -> list[str]:
        index_path = self.root / "index.json"
        if index_path.exists():
            raw = self.load_json(index_path)
            if not isinstance(raw, list):
                self.add_issue(index_path, "index.json must be an array of exam ids")
                return []
            ids = []
            for item in raw:
                if not isinstance(item, str) or not EXAM_ID_RE.fullmatch(item):
                    self.add_issue(index_path, f"invalid exam id in index.json: {item!r}")
                    continue
                ids.append(item)
            return ids

        return sorted(child.name for child in self.root.iterdir() if child.is_dir() and (child / "dump.json").is_file())

    def validate(self) -> bool:
        if not self.root.exists() or not self.root.is_dir():
            self.add_issue(self.root, "exam root does not exist or is not a directory")
            return False

        exam_ids = self.discover_exam_ids()
        seen = set()
        for exam_id in exam_ids:
            if exam_id in seen:
                self.add_issue(self.root / "index.json", f"duplicate exam id: {exam_id}")
                continue
            seen.add(exam_id)
            self.validate_pack(exam_id)

        return not self.issues

    def validate_pack(self, exam_id: str) -> None:
        exam_dir = self.root / exam_id
        dump_path = exam_dir / "dump.json"
        metadata_path = exam_dir / "metadata.json"

        if not EXAM_ID_RE.fullmatch(exam_id):
            self.add_issue(exam_dir, f"invalid exam id: {exam_id}")
            return
        if not exam_dir.is_dir():
            self.add_issue(exam_dir, "listed exam folder does not exist")
            return

        issue_count_before_dump = len(self.issues)
        questions_raw = self.load_json(dump_path)
        dump_load_failed = len(self.issues) > issue_count_before_dump
        if isinstance(questions_raw, dict) and isinstance(questions_raw.get("questions"), list):
            questions = questions_raw["questions"]
        else:
            questions = questions_raw

        metadata = self.load_json(metadata_path) if metadata_path.exists() else None
        if metadata is not None:
            self.validate_metadata(exam_id, metadata, metadata_path, questions)

        if dump_load_failed:
            return
        if not isinstance(questions, list):
            self.add_issue(dump_path, "dump.json must be an array or an object with a questions array")
            return
        if not questions:
            self.add_issue(dump_path, "exam must contain at least one question")
            return

        self.pack_count += 1
        self.question_count += len(questions)
        self.validate_questions(exam_id, questions, dump_path)

    def validate_metadata(self, exam_id: str, metadata: Any, path: Path, questions: Any) -> None:
        if not isinstance(metadata, dict):
            self.add_issue(path, "metadata.json must be an object")
            return

        metadata_id = metadata.get("id")
        if metadata_id is not None and metadata_id != exam_id:
            self.add_issue(path, f"metadata id {metadata_id!r} must match folder id {exam_id!r}")
        if metadata_id is not None and not EXAM_ID_RE.fullmatch(str(metadata_id)):
            self.add_issue(path, f"metadata id is invalid: {metadata_id!r}")

        question_total = len(questions) if isinstance(questions, list) else None
        total_questions = metadata.get("totalQuestions")
        if total_questions is not None and question_total is not None and total_questions != question_total:
            self.add_issue(path, f"totalQuestions {total_questions!r} must match dump question count {question_total}")

        question_count = metadata.get("questionCount")
        if question_count is not None:
            if not is_plain_int(question_count) or question_count < 1:
                self.add_issue(path, "questionCount must be a positive integer")
            elif question_total is not None and question_count > question_total:
                self.add_issue(path, "questionCount cannot exceed totalQuestions")

        pass_score = metadata.get("passScore")
        if pass_score is not None and (not is_plain_number(pass_score) or pass_score < 1 or pass_score > 100):
            self.add_issue(path, "passScore must be between 1 and 100")

    def validate_questions(self, exam_id: str, questions: list[Any], path: Path) -> None:
        ids = set()
        for index, question in enumerate(questions, start=1):
            label = f"question {index}"
            if not isinstance(question, dict):
                self.add_issue(path, f"{label}: item must be an object")
                continue

            question_id = str(question.get("id", "")).strip()
            if not question_id:
                self.add_issue(path, f"{label}: missing id")
            elif question_id in ids:
                self.add_issue(path, f"{label}: duplicate id {question_id!r}")
            else:
                ids.add(question_id)

            if not has_text(question.get("question")):
                self.add_issue(path, f"{label}: question text is required")

            question_type = normalize_question_type(question)
            if question_type not in SUPPORTED_TYPES:
                self.add_issue(path, f"{label}: unsupported question_type {question_type!r}")
                continue

            if question_type in {"STANDARD", "MULTI", "SEQUENCE", "DRAG_DROP_SELECT"}:
                options = question.get("options")
                if not isinstance(options, list) or len(options) < 2:
                    self.add_issue(path, f"{label}: options must contain at least two entries")
                    continue
                for option_index, option in enumerate(options, start=1):
                    if not has_text(option):
                        self.add_issue(path, f"{label}: option {option_index} is empty")

            self.validate_correct_answer(question, question_type, label, path)
            self.validate_image_refs(exam_id, question, label, path)

    def validate_correct_answer(self, question: dict[str, Any], question_type: str, label: str, path: Path) -> None:
        correct = question.get("correct")
        options = question.get("options")

        if question_type == "STANDARD":
            if not valid_option_index(correct, options):
                self.add_issue(path, f"{label}: correct must be a valid option index")
        elif question_type == "MULTI":
            if not isinstance(correct, list) or not correct:
                self.add_issue(path, f"{label}: correct must be a non-empty array")
            else:
                for value in correct:
                    if not valid_option_index(value, options):
                        self.add_issue(path, f"{label}: invalid correct option index {value!r}")
        elif question_type == "SEQUENCE":
            if not isinstance(correct, list) or not isinstance(options, list) or len(correct) != len(options):
                self.add_issue(path, f"{label}: correct sequence must match options length")
            elif sorted(correct) != list(range(len(options))):
                self.add_issue(path, f"{label}: correct sequence must be a permutation of option indices")
        elif question_type == "DRAG_DROP_SELECT":
            if not isinstance(correct, list) or not correct:
                self.add_issue(path, f"{label}: correct must be a non-empty array")
            else:
                for value in correct:
                    if not valid_option_index(value, options):
                        self.add_issue(path, f"{label}: invalid selected option index {value!r}")
            required = question.get("drag_select_required")
            if required is not None and (
                not is_plain_int(required)
                or required < 1
                or not isinstance(options, list)
                or required > len(options)
            ):
                self.add_issue(path, f"{label}: drag_select_required is invalid")
        elif question_type == "YES_NO_MATRIX":
            statements = question.get("statements")
            if not isinstance(statements, list) or not statements:
                self.add_issue(path, f"{label}: statements must contain at least one entry")
            elif any(not has_text(statement) for statement in statements):
                self.add_issue(path, f"{label}: statements must be non-empty strings")

            if not isinstance(correct, list) or not isinstance(statements, list) or len(correct) != len(statements):
                self.add_issue(path, f"{label}: correct responses must match statements length")
            elif any(answer not in (0, 1) or isinstance(answer, bool) for answer in correct):
                self.add_issue(path, f"{label}: YES_NO_MATRIX answers must be 0 or 1")

    def validate_image_refs(self, exam_id: str, question: dict[str, Any], label: str, path: Path) -> None:
        for field in ("question_images", "explanation_images"):
            refs = question.get(field)
            if refs is None:
                continue
            if not isinstance(refs, list):
                self.add_issue(path, f"{label}: {field} must be an array")
                continue
            for ref in refs:
                if not isinstance(ref, dict) or not isinstance(ref.get("filename"), str):
                    self.add_issue(path, f"{label}: {field} entries must contain filename")
                    continue
                filename = ref["filename"].strip()
                if not is_safe_image_name(filename):
                    self.add_issue(path, f"{label}: invalid image filename {filename!r}")
                    continue
                image_path = self.root / exam_id / "images" / filename
                if not image_path.is_file():
                    self.add_issue(path, f"{label}: missing image file images/{filename}")


def normalize_question_type(question: dict[str, Any]) -> str:
    raw = str(question.get("question_type") or "").strip().upper()
    aliases = {
        "": "MULTI" if isinstance(question.get("correct"), list) else "STANDARD",
        "SINGLE": "STANDARD",
        "SINGLE_CHOICE": "STANDARD",
        "MULTIPLE_CHOICE": "MULTI",
        "DRAG_DROP": "DRAG_DROP_SELECT",
    }
    return aliases.get(raw, raw)


def is_plain_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_plain_number(value: Any) -> bool:
    return (is_plain_int(value) or isinstance(value, float)) and not isinstance(value, bool)


def has_text(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def valid_option_index(value: Any, options: Any) -> bool:
    return is_plain_int(value) and isinstance(options, list) and 0 <= value < len(options)


def is_safe_image_name(value: str) -> bool:
    path = Path(value)
    return (
        path.name == value
        and not value.startswith(".")
        and IMAGE_NAME_RE.fullmatch(value) is not None
        and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate ExamSim exam packs.")
    parser.add_argument("--root", default="user-content/exams", help="Directory containing exam pack folders.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    root = Path(args.root).resolve()
    validator = PackValidator(root)
    ok = validator.validate()

    if ok:
        print(f"Validated {validator.pack_count} exam pack(s), {validator.question_count} question(s).")
        return 0

    print(f"Found {len(validator.issues)} validation issue(s):")
    for issue in validator.issues:
        print(f"- {issue.format(root)}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
