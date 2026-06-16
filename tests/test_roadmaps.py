import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROADMAPS = ROOT / "user-content" / "roadmaps.json"
INDEX = ROOT / "user-content" / "exams" / "index.json"

EXPECTED_TRACK_IDS = {"cloud-admin", "devops", "data", "ai", "security", "ai-business"}
ALLOWED_ROLES = {"core", "prerequisite"}


def load(p):
    return json.loads(p.read_text(encoding="utf-8"))


def resolve_id(entry):
    return entry if isinstance(entry, str) else entry.get("id")


class RoadmapsDataTests(unittest.TestCase):
    def setUp(self):
        self.data = load(ROADMAPS)
        self.catalog = set(load(INDEX))
        self.tracks = self.data["tracks"]

    def test_schema_version(self):
        self.assertEqual(self.data.get("schemaVersion"), "1.0")

    def test_expected_tracks_present(self):
        ids = {t["id"] for t in self.tracks}
        self.assertEqual(ids, EXPECTED_TRACK_IDS)

    def test_tracks_have_required_fields(self):
        for t in self.tracks:
            for field in ("id", "name", "tagline", "icon", "packs"):
                self.assertIn(field, t, f"{t.get('id')} missing {field}")
            self.assertTrue(t["packs"], f"{t['id']} has no packs")

    def test_every_pack_id_exists_in_catalog(self):
        for t in self.tracks:
            for entry in t["packs"]:
                pid = resolve_id(entry)
                self.assertIn(pid, self.catalog, f"{t['id']} references unknown pack {pid}")

    def test_ids_unique_within_a_track(self):
        for t in self.tracks:
            ids = [resolve_id(e) for e in t["packs"]]
            self.assertEqual(len(ids), len(set(ids)), f"{t['id']} has duplicate pack ids")

    def test_roles_are_allowed(self):
        for t in self.tracks:
            for entry in t["packs"]:
                if isinstance(entry, dict):
                    self.assertIn(entry.get("role", "core"), ALLOWED_ROLES)

    def test_devops_prerequisite_precedes_az400(self):
        devops = next(t for t in self.tracks if t["id"] == "devops")
        ids = [resolve_id(e) for e in devops["packs"]]
        self.assertIn("az104", ids)
        self.assertIn("az400", ids)
        self.assertLess(ids.index("az104"), ids.index("az400"))
        az104 = next(e for e in devops["packs"] if resolve_id(e) == "az104")
        self.assertEqual(az104.get("role"), "prerequisite")


if __name__ == "__main__":
    unittest.main()
