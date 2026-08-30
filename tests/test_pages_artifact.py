import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tools import build_pages_artifact

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "tools" / "build_pages_artifact.py"


class PagesArtifactTests(unittest.TestCase):
    def build_site(self):
        build_root = ROOT / "build"
        build_root.mkdir(exist_ok=True)
        temp_dir = tempfile.TemporaryDirectory(dir=build_root)
        self.addCleanup(temp_dir.cleanup)
        output = Path(temp_dir.name) / "site"
        subprocess.run(
            ["python", str(BUILDER), "--output", str(output)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        return output

    def test_artifact_contains_only_the_runtime_top_level(self):
        output = self.build_site()
        actual = {path.name for path in output.iterdir()}
        expected = {
            "404.html",
            "CNAME",
            "PRIVACY-AND-STORAGE.md",
            "assets",
            "editor.html",
            "exam.html",
            "exams",
            "index.html",
            "labs.html",
            "manifest.webmanifest",
            "privacy-and-storage.html",
            "roadmaps.html",
            "robots.txt",
            "service-worker.js",
            "sitemap.xml",
            "user-content",
        }
        self.assertEqual(expected, actual)

    def test_artifact_excludes_source_and_operational_material(self):
        output = self.build_site()
        forbidden = (
            ".git",
            ".github",
            ".local",
            "docs",
            "tests",
            "tools",
            "server.py",
            "package.json",
            "package-lock.json",
            "README.md",
            "CONTRIBUTING.md",
        )
        for relative in forbidden:
            with self.subTest(path=relative):
                self.assertFalse((output / relative).exists())

        self.assertTrue((output / "user-content" / "roadmaps.json").is_file())
        self.assertTrue((output / "user-content" / "exams" / "index.json").is_file())
        self.assertFalse((output / "user-content" / "README-IMPORT.md").exists())

    def test_builder_rejects_output_outside_the_repository(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                ["python", str(BUILDER), "--output", temp_dir],
                cwd=ROOT,
                check=False,
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(0, result.returncode)
        self.assertIn("inside the repository", result.stderr)

    def test_builder_rejects_an_existing_output_symlink(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            fake_root = Path(temp_dir)
            with (
                mock.patch.object(build_pages_artifact, "ROOT", fake_root),
                mock.patch.object(Path, "is_symlink", return_value=True),
            ):
                with self.assertRaisesRegex(ValueError, "symbolic link"):
                    build_pages_artifact.resolve_output("_site")

    def test_pages_workflow_builds_and_uploads_only_the_artifact(self):
        workflow = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("python tools/build_pages_artifact.py --output _site", workflow)
        self.assertIn("path: _site", workflow)
        self.assertNotIn("path: .\n", workflow)

    def test_validation_workflow_compiles_and_builds_the_artifact(self):
        workflow = (ROOT / ".github" / "workflows" / "validate.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("tools/build_pages_artifact.py", workflow)
        self.assertIn("python tools/build_pages_artifact.py --output _site", workflow)
        self.assertIn("--directory _site", workflow)


if __name__ == "__main__":
    unittest.main()
