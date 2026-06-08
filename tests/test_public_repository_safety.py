import json
import re
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PublicRepositoryBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["git", "ls-files", "-z"],
            cwd=ROOT,
            check=True,
            capture_output=True,
        )
        cls.tracked_files = [
            Path(path)
            for path in result.stdout.decode("utf-8").split("\0")
            if path
        ]

    def test_private_local_workspace_is_not_tracked(self):
        local_files = [
            path.as_posix()
            for path in self.tracked_files
            if path.parts and path.parts[0] == ".local"
        ]
        self.assertEqual(local_files, [])

    def test_sensitive_operational_artifact_names_are_not_tracked(self):
        forbidden_name = re.compile(
            r"(?i)(license[-_]?key|gumroad[-_]?scorecard|analytics[-_]?export|"
            r"buyer[-_]?data|customer[-_]?data)"
        )
        matches = [
            path.as_posix()
            for path in self.tracked_files
            if forbidden_name.search(path.name)
        ]
        self.assertEqual(matches, [])

    def test_tracked_text_does_not_contain_absolute_user_paths(self):
        text_suffixes = {
            ".css",
            ".html",
            ".js",
            ".json",
            ".md",
            ".py",
            ".txt",
            ".webmanifest",
            ".xml",
            ".yml",
            ".yaml",
        }
        absolute_user_path = re.compile(
            r"(?i)(?:"
            r"[a-z]:[\\/]+users[\\/]+[^\\/\s]+[\\/]|"
            r"/users/[^/\s]+/|"
            r"/home/[^/\s]+/|"
            r"/mnt/[a-z]/users/[^/\s]+/"
            r")"
        )
        examples = (
            "C:" + r"\Users\alice\project",
            "/" + "Users/alice/project",
            "/" + "home/alice/project",
            "/" + "mnt/c/Users/alice/project",
        )
        for example in examples:
            with self.subTest(example=example):
                self.assertRegex(example, absolute_user_path)

        matches = []

        for relative_path in self.tracked_files:
            absolute_path = ROOT / relative_path
            if (
                relative_path == Path("tests/test_public_repository_safety.py")
                or relative_path.suffix.lower() not in text_suffixes
                or not absolute_path.is_file()
            ):
                continue
            text = absolute_path.read_text(encoding="utf-8")
            if absolute_user_path.search(text):
                matches.append(relative_path.as_posix())

        self.assertEqual(matches, [])


class PublicMessagingTests(unittest.TestCase):
    def test_marketing_copy_does_not_make_absolute_privacy_claims(self):
        paths = [
            ROOT / "README.md",
            ROOT / "index.html",
            ROOT / "exams" / "index.html",
            ROOT / "tools" / "generate-exam-pages.py",
            *sorted((ROOT / "exams").glob("*/index.html")),
        ]
        forbidden = (
            "100% offline",
            "fully offline",
            "no tracking",
            "your data never leaves your browser",
        )

        for path in paths:
            text = path.read_text(encoding="utf-8").lower()
            for phrase in forbidden:
                with self.subTest(path=path.relative_to(ROOT), phrase=phrase):
                    self.assertNotIn(phrase, text)

    def test_public_privacy_page_describes_access_without_internal_tools(self):
        text = (ROOT / "privacy-and-storage.html").read_text(encoding="utf-8")
        lowered = text.lower()
        self.assertNotIn("private dashboard", lowered)
        self.assertIn("Authorized maintainers can inspect", text)
        self.assertIn("analytics is enabled by default", lowered)
        self.assertIn("attempt review", lowered)
        self.assertIn("missed-question study actions", lowered)


class PublicMetadataTests(unittest.TestCase):
    def test_public_metadata_contains_provenance_not_internal_workflow(self):
        exam_root = ROOT / "user-content" / "exams"
        exam_ids = json.loads((exam_root / "index.json").read_text(encoding="utf-8"))
        allowed_review_fields = {
            "lastReviewed",
            "sourceOfTruth",
            "sourceUrl",
            "objectiveVersion",
        }

        for exam_id in exam_ids:
            metadata_path = exam_root / exam_id / "metadata.json"
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            review = metadata.get("contentReview")

            with self.subTest(exam=exam_id):
                self.assertIsInstance(review, dict)
                self.assertEqual(set(review), allowed_review_fields)
                self.assertNotIn("coverageReview", metadata)
                self.assertNotIn("reviewStatus", metadata.get("pro", {}))


class PublicDocumentationTests(unittest.TestCase):
    def test_obsolete_duplicate_guides_are_removed(self):
        self.assertFalse((ROOT / "QUICKSTART.md").exists())
        self.assertFalse((ROOT / "docs" / "Troubleshooting.md").exists())

    def test_core_docs_match_the_current_repository_layout(self):
        paths = [
            ROOT / "README.md",
            ROOT / "CONTRIBUTING.md",
            ROOT / "docs" / "HOW-TO-DISTRIBUTE.md",
            ROOT / "docs" / "Data-and-Dumps.md",
            ROOT / "user-content" / "README-IMPORT.md",
        ]
        forbidden = ("portable/", "portable\\", "ai102", "ai-102")

        for path in paths:
            text = path.read_text(encoding="utf-8").lower()
            for phrase in forbidden:
                with self.subTest(path=path.relative_to(ROOT), phrase=phrase):
                    self.assertNotIn(phrase, text)

    def test_public_distribution_guide_excludes_commercial_operations(self):
        text = (ROOT / "docs" / "HOW-TO-DISTRIBUTE.md").read_text(encoding="utf-8").lower()
        for phrase in (
            "selling a pro pack",
            "gumroad",
            "lemon squeezy",
            "your-license-key",
            "price on curation",
        ):
            with self.subTest(phrase=phrase):
                self.assertNotIn(phrase, text)

    def test_public_pack_examples_match_filename_and_metadata_validation(self):
        import_guide = (ROOT / "user-content" / "README-IMPORT.md").read_text(encoding="utf-8")
        distribution_guide = (ROOT / "docs" / "HOW-TO-DISTRIBUTE.md").read_text(encoding="utf-8").lower()
        normalized_distribution_guide = " ".join(distribution_guide.split())

        self.assertIsNone(
            re.search(r'"filename"\s*:\s*"[^"]*[\\/]', import_guide),
            "image filename examples must not include directory separators",
        )
        self.assertNotIn("normalized by the tooling", normalized_distribution_guide)
        self.assertIn("metadata id must match the folder name", normalized_distribution_guide)

    def test_primary_docs_are_concise_and_current(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        contributing = (ROOT / "CONTRIBUTING.md").read_text(encoding="utf-8")
        changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")

        self.assertLessEqual(len(readme.splitlines()), 300)
        self.assertLessEqual(len(contributing.splitlines()), 300)
        self.assertLessEqual(len(changelog.splitlines()), 150)
        self.assertNotIn("## Roadmap", readme)
        self.assertIn("## Unreleased", changelog)

    def test_privacy_markdown_uses_current_telemetry_language(self):
        text = (ROOT / "PRIVACY-AND-STORAGE.md").read_text(encoding="utf-8")
        lowered = text.lower()
        normalized = " ".join(lowered.split())

        self.assertNotIn("aggregate analytics", lowered)
        self.assertNotIn("data never leaves the browser", lowered)
        self.assertNotIn("fully offline", lowered)
        self.assertIn("limited product telemetry", normalized)
        self.assertIn("coarse country, region, and city", normalized)
        self.assertIn("30-day retention", normalized)


if __name__ == "__main__":
    unittest.main()
