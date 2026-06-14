#!/usr/bin/env python3
"""Validate ExamSim exam packs without external dependencies."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EXAM_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
IMAGE_NAME_RE = re.compile(r"^[A-Za-z0-9_. -]{1,128}$")
SUPPORTED_TYPES = {"STANDARD", "MULTI", "YES_NO_MATRIX", "SEQUENCE", "DRAG_DROP_SELECT"}

# Lab guides (the `labs` array in a pack's dump.json) are non-graded hands-on content.
# References must point at official documentation; the safety fields below are hard gates
# so a paid lab can never ship without a cost callout and a teardown step.
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
OFFICIAL_DOC_HOST_SUFFIXES = (
    "learn.microsoft.com",
    "docs.microsoft.com",
    "azure.microsoft.com",
    "microsoft.com",
    "docs.aws.amazon.com",
    "aws.amazon.com",
    "cloud.google.com",
)
LAB_REQUIRED_TEXT_FIELDS = (
    "domain",
    "title",
    "objective",
    "expectedResult",
    "estCost",
    "objectiveVersion",
)
CONTENT_ORIGINS = {"original", "derived-from-public", "imported"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MANIFEST_NAME = "manifest.json"
MANIFEST_FORMAT = "examsim-manifest"
MANIFEST_VERSION = 1
TAXONOMY_TEXT_FIELDS = ("vendor", "certificationCode", "level", "productFamily", "contentType", "commercialStatus")
TAXONOMY_LIST_FIELDS = ("domains",)


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

        index_path = self.root / "index.json"
        issues_before_index = len(self.issues)
        exam_ids = self.discover_exam_ids()
        # "Clean" means no NEW issue was recorded against index.json itself - checked by
        # path rather than by issue count, so unrelated future issues cannot disable the guard.
        index_is_clean = not any(
            issue.path == index_path for issue in self.issues[issues_before_index:]
        )

        # Drift guard: on a static host, a pack folder absent from index.json is silently
        # invisible (no discovery, no validation, no health report). Fail loudly instead.
        # The opposite direction (listed but missing on disk) is caught by validate_pack.
        # Skipped when index.json itself was flagged (invalid JSON / not an array / bad ids):
        # exam_ids is empty or partial then, and drift noise for every disk pack would bury
        # the root cause.
        if index_path.exists() and index_is_clean:
            on_disk = sorted(
                child.name
                for child in self.root.iterdir()
                if child.is_dir() and (child / "dump.json").is_file()
            )
            for name in on_disk:
                if name not in exam_ids:
                    self.add_issue(
                        index_path,
                        f"pack folder exists on disk but is not listed in index.json: {name}",
                    )

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

        if isinstance(questions_raw, dict) and "labs" in questions_raw:
            self.validate_labs(exam_id, questions_raw.get("labs"), dump_path, metadata)

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

        content_origin = metadata.get("contentOrigin")
        if content_origin is not None and content_origin not in CONTENT_ORIGINS:
            self.add_issue(path, f"contentOrigin must be one of {sorted(CONTENT_ORIGINS)}")

        has_library_taxonomy = any(field in metadata for field in TAXONOMY_TEXT_FIELDS + TAXONOMY_LIST_FIELDS)
        if has_library_taxonomy:
            for field in TAXONOMY_TEXT_FIELDS:
                if not has_text(metadata.get(field)):
                    self.add_issue(path, f"{field} is required for library filtering")

            for field in TAXONOMY_LIST_FIELDS:
                values = metadata.get(field)
                if not isinstance(values, list) or not values or any(not has_text(value) for value in values):
                    self.add_issue(path, f"{field} must be a non-empty array of strings")

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

    def validate_labs(self, exam_id: str, labs: Any, path: Path, metadata: Any = None) -> None:
        for message in lab_validation_messages(labs):
            self.add_issue(path, message)
        if not isinstance(labs, list):
            return
        # metadata.labCount drives the homepage CTA + the SEO landing section, so a drift
        # between it and the real number of labs would advertise the wrong thing.
        if isinstance(metadata, dict) and metadata.get("labCount") is not None:
            lab_count = metadata.get("labCount")
            if not is_plain_int(lab_count) or lab_count != len(labs):
                self.add_issue(
                    path,
                    f"metadata labCount {lab_count!r} must match the number of labs in dump.json ({len(labs)})",
                )
        for lab in labs:
            if not isinstance(lab, dict):
                continue
            lab_label = f"lab {str(lab.get('id') or 'unknown')!r}"
            steps = lab.get("steps")
            if not isinstance(steps, list):
                continue
            for step in steps:
                if not isinstance(step, dict) or "image" not in step:
                    continue
                image = step.get("image")
                if not isinstance(image, dict) or not isinstance(image.get("filename"), str):
                    self.add_issue(path, f"{lab_label}: step image must contain filename")
                    continue
                filename = image["filename"].strip()
                if not is_safe_image_name(filename):
                    self.add_issue(path, f"{lab_label}: invalid image filename {filename!r}")
                    continue
                if not (self.root / exam_id / "images" / filename).is_file():
                    self.add_issue(path, f"{lab_label}: missing image file images/{filename}")


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


def is_official_doc_url(url: Any) -> bool:
    """True only for https URLs on an allowlisted official documentation host.

    https is required (not http): lab references are external links a learner clicks,
    and an imported pack must not be able to point them at a plain-HTTP doc URL.
    """
    if not has_text(url):
        return False
    try:
        parsed = urllib.parse.urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    return any(
        host == suffix or host.endswith("." + suffix)
        for suffix in OFFICIAL_DOC_HOST_SUFFIXES
    )


def lab_validation_messages(labs: Any) -> list[str]:
    """Pure structural validation of a pack's `labs` array (no filesystem access).

    Returns a list of human-readable error strings; an empty list means valid.
    Hard gates: every lab needs a non-empty `cleanup` (teardown) and an `estCost`
    callout, `freeTierOnly` must be a real boolean, and every reference must be an
    official documentation URL.
    """
    if not isinstance(labs, list):
        return ["labs must be an array"]

    messages: list[str] = []
    seen: set[str] = set()
    for index, lab in enumerate(labs, start=1):
        label = f"lab {index}"
        if not isinstance(lab, dict):
            messages.append(f"{label}: item must be an object")
            continue

        lab_id = str(lab.get("id", "")).strip()
        if not lab_id:
            messages.append(f"{label}: missing id")
        elif lab_id in seen:
            messages.append(f"{label}: duplicate id {lab_id!r}")
        else:
            seen.add(lab_id)
            label = f"lab {lab_id!r}"

        for field in LAB_REQUIRED_TEXT_FIELDS:
            if not has_text(lab.get(field)):
                messages.append(f"{label}: {field} is required")

        if not isinstance(lab.get("freeTierOnly"), bool):
            messages.append(f"{label}: freeTierOnly must be true or false")

        source_verified = lab.get("sourceVerifiedOn")
        if not (isinstance(source_verified, str) and ISO_DATE_RE.fullmatch(source_verified.strip())):
            messages.append(f"{label}: sourceVerifiedOn must be an ISO date (YYYY-MM-DD)")

        prerequisites = lab.get("prerequisites")
        if not isinstance(prerequisites, list) or not prerequisites or any(
            not has_text(item) for item in prerequisites
        ):
            messages.append(f"{label}: prerequisites must be a non-empty array of strings")

        cleanup = lab.get("cleanup")
        if not isinstance(cleanup, list) or not cleanup or any(not has_text(item) for item in cleanup):
            messages.append(f"{label}: cleanup must be a non-empty array of strings")

        steps = lab.get("steps")
        if not isinstance(steps, list) or not steps:
            messages.append(f"{label}: steps must be a non-empty array")
        else:
            for step_index, step in enumerate(steps, start=1):
                if not isinstance(step, dict):
                    messages.append(f"{label}: step {step_index} must be an object")
                    continue
                if not is_plain_int(step.get("n")):
                    messages.append(f"{label}: step {step_index} n must be an integer")
                if not has_text(step.get("instruction")):
                    messages.append(f"{label}: step {step_index} instruction is required")
                if not has_text(step.get("expected")):
                    messages.append(f"{label}: step {step_index} expected is required")

        references = lab.get("references")
        if not isinstance(references, list) or not references:
            messages.append(f"{label}: references must be a non-empty array")
        else:
            for ref_index, ref in enumerate(references, start=1):
                if not isinstance(ref, dict) or not has_text(ref.get("label")) or not has_text(ref.get("url")):
                    messages.append(f"{label}: reference {ref_index} must have label and url")
                    continue
                if not is_official_doc_url(ref.get("url")):
                    messages.append(f"{label}: reference {ref_index} url must be an official documentation URL")

    return messages


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    if path.suffix.lower() == ".json":
        # JSON pack files are pinned to LF in .gitattributes. Canonicalize CRLF
        # here as well so manifests generated or checked on Windows match CI.
        digest.update(path.read_bytes().replace(b"\r\n", b"\n"))
        return digest.hexdigest()

    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def pack_file_paths(exam_dir: Path) -> list[str]:
    """Relative file paths (forward-slash) inside an exam pack, excluding manifest.json."""
    paths: list[str] = []
    for name in ("dump.json", "metadata.json"):
        if (exam_dir / name).is_file():
            paths.append(name)
    images_dir = exam_dir / "images"
    if images_dir.is_dir():
        for image in sorted(images_dir.iterdir()):
            if image.is_file():
                paths.append(f"images/{image.name}")
    return paths


def safe_manifest_file_path(exam_dir: Path, rel: Any) -> Path | None:
    if not isinstance(rel, str) or not rel or "\\" in rel:
        return None
    rel_path = Path(rel)
    if rel_path.is_absolute() or any(part in {"", ".", ".."} for part in rel_path.parts):
        return None
    file_path = (exam_dir / rel_path).resolve()
    try:
        file_path.relative_to(exam_dir.resolve())
    except ValueError:
        return None
    return file_path


def build_manifest(exam_dir: Path) -> dict[str, Any]:
    files = {rel: sha256_file(exam_dir / rel) for rel in pack_file_paths(exam_dir)}
    return {
        "format": MANIFEST_FORMAT,
        "version": MANIFEST_VERSION,
        "algorithm": "SHA-256",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
    }


def write_manifests(root: Path, exam_ids: list[str]) -> int:
    written = 0
    for exam_id in exam_ids:
        exam_dir = root / exam_id
        if not exam_dir.is_dir():
            print(f"- {exam_id}: skipped (folder not found)")
            continue
        manifest = build_manifest(exam_dir)
        manifest_path = exam_dir / MANIFEST_NAME
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        written += 1
        print(f"- {exam_id}: wrote manifest with {len(manifest['files'])} file(s)")
    print(f"Wrote {written} manifest(s).")
    return 0


def check_manifests(root: Path, exam_ids: list[str]) -> int:
    problems = 0
    checked = 0
    for exam_id in exam_ids:
        exam_dir = root / exam_id
        manifest_path = exam_dir / MANIFEST_NAME
        if not manifest_path.is_file():
            print(f"- {exam_id}: missing {MANIFEST_NAME}")
            problems += 1
            continue
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"- {exam_id}: could not read manifest: {error}")
            problems += 1
            continue
        expected = manifest.get("files") if isinstance(manifest, dict) else None
        if not isinstance(expected, dict):
            print(f"- {exam_id}: manifest has no files map")
            problems += 1
            continue
        checked += 1
        actual_paths = set(pack_file_paths(exam_dir))
        safe_expected_paths: set[str] = set()
        for rel, expected_hash in expected.items():
            file_path = safe_manifest_file_path(exam_dir, rel)
            if file_path is None:
                print(f"- {exam_id}: unsafe manifest path {rel!r}")
                problems += 1
                continue
            safe_expected_paths.add(rel)
            if not file_path.is_file():
                print(f"- {exam_id}: missing file {rel}")
                problems += 1
                continue
            actual_hash = sha256_file(file_path)
            if actual_hash != str(expected_hash).lower():
                print(f"- {exam_id}: hash mismatch for {rel}")
                problems += 1
        for rel in sorted(actual_paths - safe_expected_paths):
            print(f"- {exam_id}: untracked file not in manifest: {rel}")
            problems += 1
    if problems:
        print(f"Manifest check failed with {problems} issue(s) across {checked} pack(s).")
        return 1
    print(f"Manifest check passed for {checked} pack(s).")
    return 0


def metadata_health_score(metadata: Any) -> tuple[int, int]:
    required = TAXONOMY_TEXT_FIELDS + TAXONOMY_LIST_FIELDS
    if not isinstance(metadata, dict):
        return 0, len(required)
    present = 0
    for field in TAXONOMY_TEXT_FIELDS:
        if has_text(metadata.get(field)):
            present += 1
    for field in TAXONOMY_LIST_FIELDS:
        values = metadata.get(field)
        if isinstance(values, list) and values and all(has_text(value) for value in values):
            present += 1
    return present, len(required)


def duplicate_question_text_count(questions: list[Any]) -> int:
    seen: set[str] = set()
    duplicates = 0
    for question in questions:
        if not isinstance(question, dict):
            continue
        text = " ".join(str(question.get("question") or "").lower().split())
        if not text:
            continue
        if text in seen:
            duplicates += 1
        else:
            seen.add(text)
    return duplicates


def question_type_summary(questions: list[Any]) -> str:
    counts: dict[str, int] = {}
    for question in questions:
        if not isinstance(question, dict):
            continue
        question_type = normalize_question_type(question)
        counts[question_type] = counts.get(question_type, 0) + 1
    return ", ".join(f"{key}:{counts[key]}" for key in sorted(counts)) or "none"


def manifest_issue_count(exam_dir: Path) -> int:
    manifest_path = exam_dir / MANIFEST_NAME
    if not manifest_path.is_file():
        return 1
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return 1
    expected = manifest.get("files") if isinstance(manifest, dict) else None
    if not isinstance(expected, dict):
        return 1
    problems = 0
    actual_paths = set(pack_file_paths(exam_dir))
    safe_expected_paths: set[str] = set()
    for rel, expected_hash in expected.items():
        file_path = safe_manifest_file_path(exam_dir, rel)
        if file_path is None:
            problems += 1
            continue
        safe_expected_paths.add(rel)
        if not file_path.is_file():
            problems += 1
            continue
        if sha256_file(file_path) != str(expected_hash).lower():
            problems += 1
    problems += len(actual_paths - safe_expected_paths)
    return problems


def image_reference_issue_count(root: Path, exam_id: str, questions: list[Any]) -> int:
    problems = 0
    for question in questions:
        if not isinstance(question, dict):
            continue
        for field in ("question_images", "explanation_images"):
            refs = question.get(field)
            if refs is None:
                continue
            if not isinstance(refs, list):
                problems += 1
                continue
            for ref in refs:
                filename = ref.get("filename") if isinstance(ref, dict) else None
                if not isinstance(filename, str) or not is_safe_image_name(filename.strip()):
                    problems += 1
                    continue
                if not (root / exam_id / "images" / filename.strip()).is_file():
                    problems += 1
    return problems


def schema_issue_count(root: Path, exam_id: str) -> int:
    validator = PackValidator(root)
    validator.validate_pack(exam_id)
    return len(validator.issues)


# --- Content-quality signals (non-blocking; surfaced by the health report) ---

# The app shuffles STANDARD/MULTI options on every attempt, so text that points at option
# POSITIONS ("the first option", "option B") or order-dependent options ("all of the above")
# renders wrong on screen. Source-order answer balance is an authoring lint (the shuffle hides
# it from users) but flags pipeline bias worth fixing at the source.
POSITIONAL_LANGUAGE_RE = re.compile(
    r"\b(first|second|third|fourth|last)\s+option\b|\boption\s*[0-9]\b|\boption\s+[A-D]\b", re.IGNORECASE
)
ORDER_DEPENDENT_OPTION_RE = re.compile(
    r"\b(all|none|both|neither)\s+of\s+the\s+(above|listed|following)\b", re.IGNORECASE
)
ANSWER_BALANCE_MIN_QUESTIONS = 20
ANSWER_BALANCE_MAX_SHARE = 0.5
ANSWER_BALANCE_DEAD_SHARE = 0.02
SHORT_EXPLANATION_CHARS = 60


def answer_position_issue_count(questions: list[Any]) -> int:
    """Count exploit-looking patterns in the SOURCE answer-position distribution."""
    standard = [
        q for q in questions
        if isinstance(q, dict) and normalize_question_type(q) == "STANDARD"
        and valid_option_index(q.get("correct"), q.get("options"))
    ]
    n = len(standard)
    if n < ANSWER_BALANCE_MIN_QUESTIONS:
        return 0
    issues = 0
    counts = Counter(q["correct"] for q in standard)
    if counts.most_common(1)[0][1] / n > ANSWER_BALANCE_MAX_SHARE:
        issues += 1
    four_plus = [q for q in standard if isinstance(q.get("options"), list) and len(q["options"]) >= 4]
    if len(four_plus) >= ANSWER_BALANCE_MIN_QUESTIONS:
        c4 = Counter(q["correct"] for q in four_plus)
        issues += sum(1 for pos in range(4) if c4.get(pos, 0) / len(four_plus) < ANSWER_BALANCE_DEAD_SHARE)
    return issues


def positional_language_issue_count(questions: list[Any]) -> int:
    """Count shuffled-type questions whose text references option positions (user-facing)."""
    issues = 0
    for question in questions:
        if not isinstance(question, dict):
            continue
        if normalize_question_type(question) not in ("STANDARD", "MULTI"):
            continue
        blob = f"{question.get('question') or ''} {question.get('explanation') or ''}"
        if POSITIONAL_LANGUAGE_RE.search(blob):
            issues += 1
            continue
        options = question.get("options")
        if isinstance(options, list) and any(
            ORDER_DEPENDENT_OPTION_RE.search(str(option)) for option in options
        ):
            issues += 1
    return issues


def short_explanation_count(questions: list[Any]) -> int:
    """Count questions whose explanation is missing or thinner than the floor."""
    return sum(
        1 for question in questions
        if isinstance(question, dict)
        and len(str(question.get("explanation") or "").strip()) < SHORT_EXPLANATION_CHARS
    )


def bounded_component_score(max_score: int, issue_count: int, penalty: int) -> int:
    return max(0, max_score - (issue_count * penalty))


def health_label(score: int) -> str:
    if score >= 90:
        return "Ready"
    if score >= 75:
        return "Review"
    return "Needs work"


def print_health_report(root: Path, exam_ids: list[str]) -> int:
    print("Exam library health report")
    for exam_id in exam_ids:
        exam_dir = root / exam_id
        metadata_path = exam_dir / "metadata.json"
        dump_path = exam_dir / "dump.json"
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.is_file() else None
            raw_questions = json.loads(dump_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"- {exam_id}: unreadable pack ({error})")
            continue

        questions = raw_questions.get("questions") if isinstance(raw_questions, dict) else raw_questions
        if not isinstance(questions, list):
            questions = []
        labs = raw_questions.get("labs") if isinstance(raw_questions, dict) else None
        lab_count = len(labs) if isinstance(labs, list) else 0
        present, total = metadata_health_score(metadata)
        percentage = round((present / total) * 100) if total else 0
        duplicate_texts = duplicate_question_text_count(questions)
        manifest_issues = manifest_issue_count(exam_dir)
        image_issues = image_reference_issue_count(root, exam_id, questions)
        schema_issues = schema_issue_count(root, exam_id)
        balance_issues = answer_position_issue_count(questions)
        wording_issues = positional_language_issue_count(questions)
        thin_explanations = short_explanation_count(questions)
        score = (
            round((present / total) * 25) if total else 0
        ) + bounded_component_score(25, schema_issues, 5) \
            + bounded_component_score(15, manifest_issues, 5) \
            + bounded_component_score(10, image_issues, 5) \
            + bounded_component_score(10, duplicate_texts, 5) \
            + bounded_component_score(5, balance_issues, 5) \
            + bounded_component_score(5, wording_issues, 5) \
            + bounded_component_score(5, thin_explanations, 1)
        manifest_status = "ok" if manifest_issues == 0 else f"{manifest_issues} issue(s)"
        image_status = "ok" if image_issues == 0 else f"{image_issues} issue(s)"
        schema_status = "ok" if schema_issues == 0 else f"{schema_issues} issue(s)"
        quality_bits = []
        if balance_issues:
            quality_bits.append(f"answer-balance:{balance_issues}")
        if wording_issues:
            quality_bits.append(f"positional-wording:{wording_issues}")
        if thin_explanations:
            quality_bits.append(f"thin-explanations:{thin_explanations}")
        quality_status = " ".join(quality_bits) if quality_bits else "ok"
        image_count = len([rel for rel in pack_file_paths(exam_dir) if rel.startswith("images/")])
        print(
            f"- {exam_id}: score:{score}/100 {health_label(score)}, "
            f"metadata:{percentage}% ({present}/{total}), schema:{schema_status}, "
            f"manifest:{manifest_status}, images:{image_status} ({image_count}), "
            f"duplicates:{duplicate_texts}, quality:{quality_status}, "
            f"questions:{len(questions)}, types:{question_type_summary(questions)}, "
            f"labs:{lab_count}"
        )
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate ExamSim exam packs.")
    parser.add_argument("--root", default="user-content/exams", help="Directory containing exam pack folders.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--write-manifest", action="store_true", help="Generate manifest.json with SHA-256 hashes for each pack.")
    group.add_argument("--check-manifest", action="store_true", help="Verify pack files against their manifest.json.")
    group.add_argument("--health-report", action="store_true", help="Print a non-blocking pack health summary.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    root = Path(args.root).resolve()
    validator = PackValidator(root)
    ok = validator.validate()

    if not ok:
        print(f"Found {len(validator.issues)} validation issue(s):")
        for issue in validator.issues:
            print(f"- {issue.format(root)}")
        return 1

    exam_ids = validator.discover_exam_ids()
    if args.write_manifest:
        return write_manifests(root, exam_ids)
    if args.check_manifest:
        return check_manifests(root, exam_ids)
    if args.health_report:
        return print_health_report(root, exam_ids)

    print(f"Validated {validator.pack_count} exam pack(s), {validator.question_count} question(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
