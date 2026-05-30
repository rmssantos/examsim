import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EditorUiReadinessTests(unittest.TestCase):
    def test_editor_layout_prevents_sidebar_input_overflow(self):
        css = (ROOT / "assets/css/editor-styles.css").read_text(encoding="utf-8")

        self.assertIn("box-sizing: border-box", css)
        self.assertIn("grid-template-columns: minmax(280px, 300px) minmax(0, 1fr)", css)
        self.assertIn("grid-template-rows: minmax(260px, 1fr) minmax(220px, 0.85fr)", css)
        self.assertIn("#searchInput", css)
        self.assertIn("min-width: 0", css)

    def test_editor_save_state_copy_is_explicit(self):
        html = (ROOT / "editor.html").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")

        self.assertIn('id="editorSaveState"', html)
        self.assertIn("No unsaved edits", html)
        self.assertNotIn("> Saved</span>", html)
        self.assertIn("Unsaved edits", js)
        self.assertIn("editorSaveState", js)
        self.assertIn("saveStatus", js)

    def test_editor_marks_textarea_edits_unsaved_after_sync(self):
        js = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")
        start = js.index("const debouncedSyncAndPreview")
        end = js.index("}, 150);", start)
        debounced_block = js[start:end]

        self.assertIn("syncFromForm();\n      markUnsaved();", debounced_block)

    def test_editor_save_state_updates_existing_dom_nodes(self):
        js = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")
        start = js.index("function updateUnsavedIndicator()")
        end = js.index("  // Warn before leaving", start)
        update_block = js[start:end]

        self.assertNotIn("innerHTML", update_block)
        self.assertNotIn("unsaved-indicator", update_block)
        self.assertIn("querySelector('i')", update_block)
        self.assertIn("querySelector('span')", update_block)
        self.assertIn("textContent = label", update_block)

    def test_editor_makes_builtin_packs_readonly_with_duplicate_path(self):
        js = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")

        # Built-in packs are detected from the server index.json
        self.assertIn("user-content/exams/index.json", js)
        self.assertIn("function isBuiltinExam", js)
        # A read-only banner with a one-click duplicate action is offered
        self.assertIn("builtin-readonly-banner", js)
        self.assertIn("Duplicate to my packs", js)
        self.assertIn("async function duplicateForEditing", js)
        # saveAll refuses to overwrite a built-in pack in place and duplicates instead
        save_start = js.index("async function saveAll(")
        save_block = js[save_start:save_start + 700]
        self.assertIn("if (isBuiltinExam(examId))", save_block)
        self.assertIn("duplicateForEditing()", save_block)

    def test_validation_workflow_runs_all_unittest_files(self):
        workflow = (ROOT / ".github/workflows/validate.yml").read_text(encoding="utf-8")

        self.assertIn("python -m unittest discover -s tests -v", workflow)


if __name__ == "__main__":
    unittest.main()
