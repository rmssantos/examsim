import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACK_ROOT = ROOT / "user-content" / "exams"
STUDY_GUIDE_ROOT = (
    "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides"
)


def load_pack(exam_id):
    exam_dir = PACK_ROOT / exam_id
    dump = json.loads((exam_dir / "dump.json").read_text(encoding="utf-8"))
    metadata = json.loads((exam_dir / "metadata.json").read_text(encoding="utf-8"))
    return dump, metadata


def by_id(dump, question_id):
    return next(question for question in dump if question.get("id") == question_id)


def content_blob(question):
    return json.dumps(question, ensure_ascii=False).lower()


class Sc900July2026RefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("sc900")

    def test_metadata_matches_july_28_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "SC-900 skills measured as of July 28, 2026",
        )
        self.assertEqual(
            self.meta["contentReview"]["sourceUrl"],
            f"{STUDY_GUIDE_ROOT}/sc-900",
        )
        compliance = next(
            domain
            for domain in self.meta["objectiveDomains"]
            if domain["code"] == "SCI-4"
        )
        self.assertEqual(compliance["weightRange"], "20-25%")

    def test_question_25_covers_agent_id_from_the_current_identity_objective(self):
        question = by_id(self.dump, 25)
        blob = content_blob(question)
        self.assertIn("agent id", blob)
        self.assertIn("agent identity", blob)
        self.assertIn("special service principal", blob)
        self.assertEqual(
            question["reference"],
            "https://learn.microsoft.com/en-us/entra/agent-id/agent-identities",
        )

    def test_questions_147_and_148_use_current_unified_ediscovery_terms(self):
        for question_id in (147, 148):
            question = by_id(self.dump, question_id)
            blob = content_blob(question)
            self.assertIn("microsoft purview ediscovery", blob)
            self.assertIn("review set", blob)
            self.assertNotIn("ediscovery (premium)", blob)
            self.assertNotIn("ediscovery (standard)", blob)
            self.assertNotIn("premium)", blob)
            self.assertNotIn("standard)", blob)
            self.assertEqual(
                question["reference"],
                "https://learn.microsoft.com/en-us/purview/edisc-features-components",
            )


class Ab730July2026RefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("ab730")

    def test_metadata_matches_july_22_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "AB-730 skills measured as of July 22, 2026",
        )

    def test_confirmed_conversation_questions_use_full_product_name(self):
        expected_answers = {77: 1, 83: [0, 1, 2]}
        for question_id in (77, 83):
            question = by_id(self.dump, question_id)
            self.assertIn("Microsoft 365 Copilot", json.dumps(question, ensure_ascii=False))
            self.assertEqual(question["correct"], expected_answers[question_id])


class Ab731July2026RefreshTests(unittest.TestCase):
    FOUNDRY_IDS = tuple(range(29, 38)) + tuple(range(90, 104))
    FOUNDRY_MODULE = "Microsoft Foundry and Foundry Tools"

    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("ab731")

    def test_metadata_matches_july_22_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "AB-731 skills measured as of July 22, 2026",
        )

    def test_confirmed_foundry_questions_share_current_module_name(self):
        modules = {module["name"] for module in self.meta["modules"]}
        self.assertIn(self.FOUNDRY_MODULE, modules)
        self.assertNotIn("Microsoft Foundry and Azure AI Services", modules)
        for question_id in self.FOUNDRY_IDS:
            self.assertEqual(by_id(self.dump, question_id)["module"], self.FOUNDRY_MODULE)
        domain = next(
            domain
            for domain in self.meta["objectiveDomains"]
            if domain["code"] == "AB731-2"
        )
        self.assertIn(self.FOUNDRY_MODULE, domain["mappedModules"])

    def test_confirmed_questions_use_foundry_tools_and_vision_terms(self):
        for question_id in (30, 91):
            blob = content_blob(by_id(self.dump, question_id))
            self.assertIn("foundry tools", blob)
            self.assertNotIn("azure ai services", blob)
        for question_id in (37, 95):
            self.assertIn(
                "Azure Vision in Foundry Tools",
                json.dumps(by_id(self.dump, question_id), ensure_ascii=False),
            )

    def test_question_29_correct_option_uses_current_foundry_tools_term(self):
        question = by_id(self.dump, 29)
        correct_option = question["options"][question["correct"]].lower()
        self.assertIn("foundry tools", correct_option)
        self.assertNotIn("azure ai services", content_blob(question))
        self.assertEqual(
            question["reference"],
            "https://learn.microsoft.com/en-us/azure/foundry/what-is-foundry",
        )

    def test_question_48_uses_current_foundry_tools_subscription_models(self):
        question = by_id(self.dump, 48)
        blob = content_blob(question)
        self.assertIn("foundry tools", blob)
        self.assertIn("pay-as-you-go", blob)
        self.assertIn("commitment tiers", blob)
        self.assertIn("eligible", question["question"].lower())
        correct_option = question["options"][question["correct"]].lower()
        for term in ("expected usage volume", "predictable costs", "cost governance"):
            self.assertIn(term, correct_option)
        self.assertNotIn("scalability needs", blob)
        self.assertNotIn("prepaid", blob)
        self.assertEqual(question["correct"], 2)
        self.assertEqual(
            question["reference"],
            "https://learn.microsoft.com/en-us/azure/foundry/concepts/manage-costs",
        )

    def test_question_50_covers_current_copilot_license_types(self):
        question = by_id(self.dump, 50)
        blob = content_blob(question)
        for term in ("pay-as-you-go", "monthly", "included with a microsoft 365 subscription"):
            self.assertIn(term, blob)
        self.assertEqual(question["correct"], [0, 1, 2])
        self.assertEqual(
            question["reference"],
            f"{STUDY_GUIDE_ROOT}/ab-731",
        )


class Az400July2026RefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("az400")

    def test_metadata_matches_july_27_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "AZ-400 skills measured as of July 27, 2026",
        )
        for domain in self.meta["objectiveDomains"]:
            self.assertIn("July 27, 2026", domain["source"])
            self.assertEqual(domain["sourceUrl"], f"{STUDY_GUIDE_ROOT}/az-400")

    def test_question_22_covers_automated_security_and_compliance_scanning(self):
        question = by_id(self.dump, 22)
        blob = content_blob(question)
        self.assertEqual(question["module"], "Automated security and compliance scanning")
        for term in ("code scanning", "secret scanning", "dependabot"):
            self.assertIn(term, blob)
        self.assertEqual(question["correct"], [0, 1, 2])
        self.assertEqual(
            question["reference"],
            "https://learn.microsoft.com/en-us/azure/defender-for-cloud/"
            "recommendations-reference-data",
        )

    def test_question_25_covers_metrics_distributed_tracing_and_kql(self):
        question = by_id(self.dump, 25)
        blob = content_blob(question)
        self.assertEqual(question["module"], "Analyze metrics from instrumentation")
        for term in ("metrics", "distributed tracing", "application insights", "kql"):
            self.assertIn(term, blob)
        self.assertEqual(question["question_type"], "YES_NO_MATRIX")
        self.assertEqual(question["reference"], f"{STUDY_GUIDE_ROOT}/az-400")

    def test_preview_keeps_its_25_question_contract(self):
        self.assertEqual(len(self.dump), 25)
        self.assertEqual(self.meta["totalQuestions"], 25)
        self.assertEqual(self.meta["questionCount"], 25)


class Dp900July2026RefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("dp900")

    def test_metadata_matches_july_21_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "DP-900 skills measured as of July 21, 2026",
        )
        self.assertIn("July 21, 2026", self.meta["description"])

    def test_metadata_only_refresh_preserves_count_and_answer_key(self):
        answer_key = [(question["id"], question["correct"]) for question in self.dump]
        payload = json.dumps(
            answer_key,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        self.assertEqual(len(self.dump), 130)
        self.assertEqual(
            hashlib.sha256(payload).hexdigest(),
            "2651d62cc39af9e87cc746a68ee05c5c40c8833497cbf10b072c0d8ed5912e51",
        )


class Dp700July2026RefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dump, cls.meta = load_pack("dp700")

    def test_metadata_matches_july_21_objectives_and_july_30_review(self):
        self.assertEqual(self.meta["contentReview"]["lastReviewed"], "2026-07-30")
        self.assertEqual(
            self.meta["contentReview"]["objectiveVersion"],
            "DP-700 skills measured as of July 21, 2026",
        )
        self.assertIn("July 21, 2026", self.meta["description"])

    def test_question_2_covers_current_airflow_workspace_pool_settings(self):
        question = by_id(self.dump, 2)
        blob = content_blob(question)
        for term in ("apache airflow", "starter pool", "custom pool"):
            self.assertIn(term, blob)
        self.assertEqual(question["correct"], [0, 1])
        self.assertEqual(
            question["reference"],
            "https://learn.microsoft.com/en-us/fabric/data-factory/"
            "apache-airflow-jobs-workspace-settings",
        )

    def test_preview_keeps_its_25_question_contract(self):
        self.assertEqual(len(self.dump), 25)
        self.assertEqual(self.meta["totalQuestions"], 25)
        self.assertEqual(self.meta["questionCount"], 25)


class July2026SourceLedgerTests(unittest.TestCase):
    def test_public_source_ledger_records_all_six_official_guides(self):
        ledger_path = ROOT / "docs" / "content" / "2026-07-30-objective-refresh-ledger.md"
        self.assertTrue(ledger_path.is_file(), "July 2026 objective source ledger is missing")
        ledger = ledger_path.read_text(encoding="utf-8")
        expected = {
            "SC-900": ("July 28, 2026", "sc-900"),
            "AB-730": ("July 22, 2026", "ab-730"),
            "AB-731": ("July 22, 2026", "ab-731"),
            "AZ-400": ("July 27, 2026", "az-400"),
            "DP-900": ("July 21, 2026", "dp-900"),
            "DP-700": ("July 21, 2026", "dp-700"),
        }
        for exam_id, (date, slug) in expected.items():
            self.assertIn(exam_id, ledger)
            self.assertIn(date, ledger)
            self.assertIn(f"{STUDY_GUIDE_ROOT}/{slug}", ledger)
        self.assertIn(
            "local module label is now “Microsoft Foundry and Foundry Tools”",
            ledger,
        )
        self.assertIn("official objective name “Foundry Tools”", ledger)
        self.assertIn("Metadata only; no answer change", ledger)
        self.assertNotRegex(ledger, r"[A-Za-z]:\\")


if __name__ == "__main__":
    unittest.main()
