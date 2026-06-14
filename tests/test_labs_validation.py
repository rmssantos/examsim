import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

spec = importlib.util.spec_from_file_location(
    "validate_exam_packs_labs", ROOT / "tools" / "validate-exam-packs.py"
)
vep = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = vep
spec.loader.exec_module(vep)


def _valid_lab(lab_id="lab-az104-rbac-rg"):
    return {
        "id": lab_id,
        "domain": "AZ104-1",
        "title": "Assign an RBAC role at resource-group scope",
        "objective": "Grant least-privilege access to a single resource group.",
        "prerequisites": ["Azure free account", "Azure CLI installed and signed in"],
        "freeTierOnly": True,
        "estCost": "Expected cost: ~0 EUR. Role assignments are free; delete the group at the end.",
        "steps": [
            {
                "n": 1,
                "instruction": "Create a sandbox resource group.",
                "expected": "provisioningState is Succeeded.",
            }
        ],
        "expectedResult": "The user has Reader on exactly one resource group.",
        "cleanup": ["az group delete --name rg-lab --yes --no-wait"],
        "references": [
            {
                "label": "Assign Azure roles using Azure CLI",
                "url": "https://learn.microsoft.com/azure/role-based-access-control/role-assignments-cli",
            }
        ],
        "sourceVerifiedOn": "2026-06-14",
        "objectiveVersion": "AZ-104 skills measured as of April 17, 2026",
    }


class LabValidationTests(unittest.TestCase):
    def test_valid_lab_passes(self):
        self.assertEqual(vep.lab_validation_messages([_valid_lab()]), [])

    def test_labs_must_be_a_list(self):
        self.assertEqual(vep.lab_validation_messages({"id": "x"}), ["labs must be an array"])

    def test_missing_cleanup_is_rejected(self):
        lab = _valid_lab()
        lab["cleanup"] = []
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("cleanup" in m for m in messages), messages)

    def test_empty_steps_is_rejected(self):
        lab = _valid_lab()
        lab["steps"] = []
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("steps" in m for m in messages), messages)

    def test_step_missing_expected_is_rejected(self):
        lab = _valid_lab()
        lab["steps"] = [{"n": 1, "instruction": "do it"}]
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("expected" in m for m in messages), messages)

    def test_freetieronly_must_be_boolean(self):
        lab = _valid_lab()
        lab["freeTierOnly"] = "yes"
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("freeTierOnly" in m for m in messages), messages)

    def test_missing_estcost_is_rejected(self):
        lab = _valid_lab()
        del lab["estCost"]
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("estCost" in m for m in messages), messages)

    def test_non_official_reference_url_is_rejected(self):
        lab = _valid_lab()
        lab["references"] = [{"label": "Blog", "url": "https://example.com/post"}]
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("official documentation" in m for m in messages), messages)

    def test_official_aws_reference_url_is_accepted(self):
        lab = _valid_lab()
        lab["references"] = [
            {"label": "AWS docs", "url": "https://docs.aws.amazon.com/whatever"}
        ]
        self.assertEqual(vep.lab_validation_messages([lab]), [])

    def test_duplicate_lab_id_is_rejected(self):
        messages = vep.lab_validation_messages([_valid_lab(), _valid_lab()])
        self.assertTrue(any("duplicate id" in m for m in messages), messages)

    def test_bad_source_verified_date_is_rejected(self):
        lab = _valid_lab()
        lab["sourceVerifiedOn"] = "June 2026"
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("sourceVerifiedOn" in m for m in messages), messages)

    def test_missing_objective_version_is_rejected(self):
        lab = _valid_lab()
        del lab["objectiveVersion"]
        messages = vep.lab_validation_messages([lab])
        self.assertTrue(any("objectiveVersion" in m for m in messages), messages)


class OfficialDocUrlTests(unittest.TestCase):
    def test_learn_microsoft_is_official(self):
        self.assertTrue(vep.is_official_doc_url("https://learn.microsoft.com/azure/x"))

    def test_subdomain_of_official_is_official(self):
        self.assertTrue(vep.is_official_doc_url("https://docs.aws.amazon.com/iam/"))

    def test_lookalike_host_is_rejected(self):
        self.assertFalse(vep.is_official_doc_url("https://learn.microsoft.com.evil.com/x"))

    def test_non_https_is_rejected(self):
        self.assertFalse(vep.is_official_doc_url("ftp://learn.microsoft.com/x"))

    def test_http_is_rejected(self):
        # https is required; a plain-HTTP official host must not pass the gate.
        self.assertFalse(vep.is_official_doc_url("http://learn.microsoft.com/azure/x"))

    def test_empty_is_rejected(self):
        self.assertFalse(vep.is_official_doc_url(""))


class LabCountReconciliationTests(unittest.TestCase):
    QUESTION = {
        "question": "Which service?",
        "options": ["a", "b", "c", "d"],
        "correct": 0,
        "explanation": "Because a.",
        "reference": "https://learn.microsoft.com/azure/x",
    }

    def _labcount_issues(self, dump, metadata):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            exam_dir = root / "x"
            exam_dir.mkdir()
            (exam_dir / "dump.json").write_text(json.dumps(dump), encoding="utf-8")
            if metadata is not None:
                (exam_dir / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
            validator = vep.PackValidator(root)
            validator.validate_pack("x")
            return [m for m in (getattr(i, "message", str(i)) for i in validator.issues) if "labCount" in m]

    def test_labs_without_labcount_is_flagged(self):
        issues = self._labcount_issues({"questions": [self.QUESTION], "labs": [_valid_lab()]}, {"id": "x"})
        self.assertTrue(any("required" in m for m in issues), issues)

    def test_labcount_without_labs_is_flagged(self):
        issues = self._labcount_issues({"questions": [self.QUESTION]}, {"id": "x", "labCount": 5})
        self.assertTrue(any("must equal" in m for m in issues), issues)

    def test_matching_labcount_is_clean(self):
        issues = self._labcount_issues(
            {"questions": [self.QUESTION], "labs": [_valid_lab()]}, {"id": "x", "labCount": 1}
        )
        self.assertEqual(issues, [])

    def test_no_labs_no_labcount_is_clean(self):
        issues = self._labcount_issues({"questions": [self.QUESTION]}, {"id": "x"})
        self.assertEqual(issues, [])


if __name__ == "__main__":
    unittest.main()
