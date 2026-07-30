import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class Sprint1ReadinessTests(unittest.TestCase):
    def test_service_worker_versioned_and_network_first_for_mutable_exam_assets(self):
        text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        core_start = text.index("const CORE_ASSETS")
        core_end = text.index("\n];", core_start)
        core_assets = text[core_start:core_end]

        # Version-agnostic: any examsim-pwa-vX.Y is fine (bumped on releases to
        # purge stale caches); pinning the exact number made this brittle.
        self.assertRegex(text, r"examsim-pwa-v\d+\.\d+")
        self.assertIn("./assets/js/secure-transfer.js", text)
        self.assertIn("./assets/js/zip-import-worker.js", core_assets)
        self.assertIn("./assets/vendor/jszip/jszip.min.js", core_assets)
        for path in (
            "/manifest.webmanifest",
            "/user-content/exams/index.json",
            "/metadata.json",
            "/dump.json",
        ):
            self.assertIn(path, text)

    def test_service_worker_network_first_falls_back_to_all_caches(self):
        text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        start = text.index("async function networkFirst")
        end = text.index("self.addEventListener('install'", start)
        network_first = text[start:end]

        self.assertIn("await caches.match(request)", network_first)

    def test_service_worker_serves_cached_docs_before_app_shell_fallback(self):
        text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        core_start = text.index("const CORE_ASSETS")
        core_end = text.index("\n];", core_start)
        core_assets = text[core_start:core_end]
        start = text.index("if (request.mode === 'navigate')")
        end = text.index("if (isAppShellNetworkFirstAsset", start)
        navigate_block = text[start:end]

        self.assertIn("./privacy-and-storage.html", core_assets)
        self.assertIn("./PRIVACY-AND-STORAGE.md", core_assets)
        self.assertNotIn("./license.html", core_assets)
        self.assertNotIn("./LICENSE", core_assets)
        self.assertIn("const cached = await caches.match(request)", navigate_block)
        self.assertIn("if (cached) return cached", navigate_block)
        self.assertLess(
            navigate_block.index("const cached = await caches.match(request)"),
            navigate_block.index("return navigationFallback(url.pathname)"),
        )

    def test_service_worker_revalidates_app_shell_assets_before_cache_fallback(self):
        text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        start = text.index("const APP_SHELL_NETWORK_FIRST_ASSETS")
        end = text.index("\n\nfunction sameOrigin", start)
        app_shell_assets = text[start:end]

        self.assertIn("APP_SHELL_NETWORK_FIRST_ASSETS", text)
        self.assertIn("const APP_SHELL_NETWORK_FIRST_ASSETS = [", app_shell_assets)
        self.assertNotIn("CORE_ASSETS.filter", app_shell_assets)
        for asset in (
            "./assets/js/editor.js",
            "./assets/css/editor-styles.css",
            "./assets/js/pwa.js",
            "./assets/js/zip-import-worker.js",
        ):
            self.assertIn(asset, app_shell_assets)
        for vendor_asset in (
            "./assets/vendor/jszip/jszip.min.js",
            "./assets/vendor/fontawesome/css/all.min.css",
        ):
            self.assertNotIn(vendor_asset, app_shell_assets)
        self.assertIn("isAppShellNetworkFirstAsset(url)", text)
        self.assertIn("cache: 'no-cache'", text)

    def test_pwa_registration_exposes_update_available_prompt(self):
        text = (ROOT / "assets/js/pwa.js").read_text(encoding="utf-8")

        self.assertIn("showUpdateAvailable", text)
        self.assertIn("examsim-update-toast", text)
        self.assertIn("SKIP_WAITING", text)
        self.assertIn("registration.addEventListener('updatefound'", text)

    def test_exam_pack_validator_accepts_public_packs(self):
        result = subprocess.run(
            [
                sys.executable,
                "tools/validate-exam-packs.py",
                "--root",
                "user-content/exams",
            ],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertRegex(result.stdout, r"Validated \d+ exam pack\(s\), \d+ question\(s\)\.")

    def test_exam_pack_validator_reports_missing_dump_without_schema_noise(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = root / "missingdump"
            exam_dir.mkdir(parents=True)
            (root / "index.json").write_text(json.dumps(["missingdump"]), encoding="utf-8")
            (exam_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "id": "missingdump",
                        "name": "Missing Dump",
                        "questionCount": 1,
                        "totalQuestions": 1,
                    }
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
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

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("missing file", result.stdout)
        self.assertNotIn("dump.json must be an array", result.stdout)

    def test_exam_pack_validator_does_not_duplicate_missing_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = root / "missingids"
            exam_dir.mkdir(parents=True)
            (root / "index.json").write_text(json.dumps(["missingids"]), encoding="utf-8")
            (exam_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "id": "missingids",
                        "name": "Missing IDs",
                        "questionCount": 2,
                        "totalQuestions": 2,
                    }
                ),
                encoding="utf-8",
            )
            (exam_dir / "dump.json").write_text(
                json.dumps(
                    [
                        {"question": "First missing id", "options": ["A", "B"], "correct": 0},
                        {"question": "Second missing id", "options": ["A", "B"], "correct": 1},
                    ]
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
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

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("question 1: missing id", result.stdout)
        self.assertIn("question 2: missing id", result.stdout)
        self.assertNotIn("duplicate id ''", result.stdout)

    def test_exam_pack_validator_rejects_boolean_yes_no_matrix_answers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = root / "badmatrix"
            exam_dir.mkdir(parents=True)
            (root / "index.json").write_text(json.dumps(["badmatrix"]), encoding="utf-8")
            (exam_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "id": "badmatrix",
                        "name": "Bad Matrix",
                        "questionCount": 1,
                        "totalQuestions": 1,
                    }
                ),
                encoding="utf-8",
            )
            (exam_dir / "dump.json").write_text(
                json.dumps(
                    [
                        {
                            "id": 1,
                            "question_type": "YES_NO_MATRIX",
                            "question": "Validate the statements.",
                            "statements": ["One", "Two"],
                            "correct": [True, False],
                        }
                    ]
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
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

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("YES_NO_MATRIX answers must be 0 or 1", result.stdout)

    def test_exam_pack_validator_rejects_backslash_image_filenames(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "exams"
            exam_dir = root / "badimage"
            exam_dir.mkdir(parents=True)
            (root / "index.json").write_text(json.dumps(["badimage"]), encoding="utf-8")
            (exam_dir / "metadata.json").write_text(
                json.dumps(
                    {
                        "id": "badimage",
                        "name": "Bad Image",
                        "questionCount": 1,
                        "totalQuestions": 1,
                    }
                ),
                encoding="utf-8",
            )
            (exam_dir / "dump.json").write_text(
                json.dumps(
                    [
                        {
                            "id": 1,
                            "question": "Reject unsafe image filenames.",
                            "options": ["A", "B"],
                            "correct": 0,
                            "question_images": [{"filename": "foo\\bar.png"}],
                        }
                    ]
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
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

        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("invalid image filename 'foo\\\\bar.png'", result.stdout)

    def test_exam_pack_validator_enforces_all_cardinality_boundaries(self):
        def reference(index):
            return {
                "label": f"Official documentation {index}",
                "url": "https://learn.microsoft.com/security/",
            }

        def step(index, *, with_image=False):
            value = {
                "n": index + 1,
                "instruction": f"Step {index + 1}",
                "expected": "Expected result",
            }
            if with_image:
                value["image"] = {"filename": "image.png"}
            return value

        def lab(index):
            return {
                "id": f"lab-{index}",
                "domain": "SEC-1",
                "title": "Safe lab",
                "objective": "Exercise a safe control.",
                "prerequisites": ["A test account"],
                "freeTierOnly": True,
                "estCost": "No cost.",
                "steps": [step(0)],
                "expectedResult": "The control works.",
                "cleanup": ["Delete the test resource."],
                "references": [reference(0)],
                "sourceVerifiedOn": "2026-07-30",
                "objectiveVersion": "Current objectives",
            }

        multi_question = {
            "id": "q-multi",
            "question_type": "MULTI",
            "question": "Select the correct options.",
            "options": ["Option"] * 50,
            "correct": list(range(50)),
            "question_images": [{"filename": "image.png"}] * 20,
            "references": ["https://learn.microsoft.com/security/"] * 20,
        }
        matrix_question = {
            "id": "q-matrix",
            "question_type": "YES_NO_MATRIX",
            "question": "Validate the statements.",
            "statements": ["Statement"] * 50,
            "correct": [0] * 50,
        }
        exact_labs = [lab(index) for index in range(50)]
        exact_labs[0].update(
            {
                "prerequisites": ["Prerequisite"] * 25,
                "cleanup": ["Cleanup"] * 25,
                "references": [reference(index) for index in range(25)],
                "steps": [
                    step(index, with_image=index < 20) for index in range(100)
                ],
            }
        )
        exact_dump = {
            "questions": [multi_question, matrix_question],
            "labs": exact_labs,
        }
        exact_metadata = {
            "id": "bounded",
            "name": "Bounded Pack",
            "questionCount": 2,
            "totalQuestions": 2,
            "labCount": 50,
            "modules": ["Module"] * 100,
            "objectiveDomains": [
                {"name": "Domain", "mappedModules": ["Module"] * 100}
            ],
        }

        def validate(dump, metadata):
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp) / "exams"
                exam_dir = root / "bounded"
                images_dir = exam_dir / "images"
                images_dir.mkdir(parents=True)
                (root / "index.json").write_text(
                    json.dumps(["bounded"]),
                    encoding="utf-8",
                )
                (exam_dir / "dump.json").write_text(
                    json.dumps(dump),
                    encoding="utf-8",
                )
                (exam_dir / "metadata.json").write_text(
                    json.dumps(metadata),
                    encoding="utf-8",
                )
                (images_dir / "image.png").write_bytes(
                    b"\x89PNG\r\n\x1a\nbounded-test"
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

        exact_result = validate(exact_dump, exact_metadata)
        self.assertEqual(exact_result.returncode, 0, exact_result.stdout)

        over_cases = {}

        def add_case(name, mutation):
            dump = copy.deepcopy(exact_dump)
            metadata = copy.deepcopy(exact_metadata)
            mutation(dump, metadata)
            over_cases[name] = (dump, metadata)

        add_case(
            "options",
            lambda dump, _metadata: dump["questions"][0].update(
                {"options": ["Option"] * 51}
            ),
        )
        add_case(
            "correct",
            lambda dump, _metadata: dump["questions"][0].update(
                {"correct": list(range(51))}
            ),
        )
        add_case(
            "statements",
            lambda dump, _metadata: dump["questions"][1].update(
                {"statements": ["Statement"] * 51}
            ),
        )
        add_case(
            "question images",
            lambda dump, _metadata: dump["questions"][0].update(
                {"question_images": [{"filename": "image.png"}] * 21}
            ),
        )
        add_case(
            "question references",
            lambda dump, _metadata: dump["questions"][0].update(
                {"references": ["https://learn.microsoft.com/security/"] * 21}
            ),
        )

        def add_extra_lab(dump, metadata):
            dump["labs"].append(lab(50))
            metadata["labCount"] = 51

        add_case("labs", add_extra_lab)
        add_case(
            "lab steps",
            lambda dump, _metadata: dump["labs"][0].update(
                {"steps": [step(index) for index in range(101)]}
            ),
        )
        add_case(
            "lab images",
            lambda dump, _metadata: dump["labs"][0].update(
                {
                    "steps": [
                        step(index, with_image=index < 21)
                        for index in range(100)
                    ]
                }
            ),
        )
        add_case(
            "lab prerequisites",
            lambda dump, _metadata: dump["labs"][0].update(
                {"prerequisites": ["Prerequisite"] * 26}
            ),
        )
        add_case(
            "lab cleanup",
            lambda dump, _metadata: dump["labs"][0].update(
                {"cleanup": ["Cleanup"] * 26}
            ),
        )
        add_case(
            "lab references",
            lambda dump, _metadata: dump["labs"][0].update(
                {"references": [reference(index) for index in range(26)]}
            ),
        )
        add_case(
            "credentialed lab reference",
            lambda dump, _metadata: dump["labs"][0].update(
                {
                    "references": [
                        {
                            "label": "Credentialed URL",
                            "url": "https://attacker@learn.microsoft.com/security/",
                        }
                    ]
                }
            ),
        )
        add_case(
            "metadata lists",
            lambda _dump, metadata: metadata.update(
                {"modules": ["Module"] * 101}
            ),
        )
        add_case(
            "nested metadata lists",
            lambda _dump, metadata: metadata["objectiveDomains"][0].update(
                {"mappedModules": ["Module"] * 101}
            ),
        )

        for name, (dump, metadata) in over_cases.items():
            with self.subTest(boundary=name):
                result = validate(dump, metadata)
                self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_docs_describe_current_yes_no_matrix_schema_and_study_mode_status(self):
        data_docs = (ROOT / "docs/Pack-Format.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        privacy = (ROOT / "PRIVACY-AND-STORAGE.md").read_text(encoding="utf-8")

        self.assertNotIn('"correct": [true, false, true]', data_docs)
        self.assertIn('"correct": [0, 1, 0]', data_docs)
        self.assertIn("0 = Yes, 1 = No", data_docs)
        self.assertNotIn("- Study mode with spaced repetition", readme)
        self.assertIn("Study Mode with spaced repetition", readme)
        self.assertIn("local image upload endpoint", privacy)
        for phrase in (
            "50 options",
            "20 image references",
            "50 labs",
            "100 steps",
            "25 prerequisites",
            "25 cleanup",
            "25 official-documentation references",
            "100 items",
            "including nested lists",
            "dedicated Web Worker",
            "actual decompressed bytes",
            "shortest normalized",
            "same basename",
        ):
            self.assertIn(phrase, data_docs)

    def test_validation_workflow_runs_sprint1_checks(self):
        workflow = ROOT / ".github/workflows/validate.yml"
        self.assertTrue(workflow.exists(), "Missing .github/workflows/validate.yml")
        text = workflow.read_text(encoding="utf-8")

        self.assertIn("python -m unittest discover -s tests -v", text)
        self.assertIn("python tools/validate-exam-packs.py --root user-content/exams", text)
        self.assertIn("node --check service-worker.js", text)
        self.assertIn("python -m py_compile server.py", text)


if __name__ == "__main__":
    unittest.main()
