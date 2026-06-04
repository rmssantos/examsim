import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class MobileA11yReadinessTests(unittest.TestCase):
    def test_question_navigator_exposes_button_state(self):
        html = (ROOT / "exam.html").read_text(encoding="utf-8")
        js = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")

        self.assertIn('aria-label="Toggle question navigator"', html)
        self.assertIn('aria-expanded="false"', html)
        self.assertIn('aria-controls="question-navigator"', html)
        self.assertIn("btn.type = 'button';", js)
        self.assertIn("btn.setAttribute('aria-current', 'step');", js)
        self.assertIn("btn.setAttribute('aria-label', label);", js)
        self.assertIn("toggle.setAttribute('aria-expanded', String(!shouldHide));", js)

    def test_exam_focus_indicators_cover_icon_and_question_controls(self):
        exam_css = (ROOT / "assets/css/exam-enhancements.css").read_text(encoding="utf-8")
        multi_css = (ROOT / "assets/css/multi-exam-styles.css").read_text(encoding="utf-8")

        for selector in (
            "#close-feedback:focus-visible",
            ".toggle-navigator:focus-visible",
            ".nav-grid button:focus-visible",
            ".yn-btn:focus-visible",
            ".seq-btn:focus-visible",
        ):
            self.assertIn(selector, exam_css)

        self.assertIn(".ddselect-btn:focus-visible", multi_css)
        self.assertIn(".chip-remove:focus-visible", multi_css)
        self.assertRegex(multi_css, r"\.ddselect-btn\s*\{[\s\S]*?min-height:\s*44px;")

    def test_pro_modal_traps_tab_focus(self):
        js = (ROOT / "assets/js/homepage.js").read_text(encoding="utf-8")
        modal_handler = js[js.index("this._proModalKeyHandler = (e) =>") : js.index("document.addEventListener('keydown', this._proModalKeyHandler)")]

        self.assertIn("e.key !== 'Tab'", modal_handler)
        self.assertIn("dialog.querySelectorAll", modal_handler)
        self.assertIn("e.shiftKey", modal_handler)
        self.assertIn("last.focus();", modal_handler)
        self.assertIn("first.focus();", modal_handler)

    def test_drag_drop_select_has_keyboard_and_accessible_labels(self):
        js = (ROOT / "assets/js/script-multi-exam.js").read_text(encoding="utf-8")

        self.assertIn("questionType === 'DRAG_DROP_SELECT'", js)
        self.assertIn("['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)", js)
        self.assertIn("#options-container .ddselect-btn, #options-container .chip-remove", js)
        self.assertIn("controls[nextIndex].focus();", js)
        self.assertIn("btn.setAttribute('aria-label', `Select option", js)
        self.assertIn("rm.setAttribute('aria-label', `Remove selection", js)
        self.assertIn("icon.setAttribute('aria-hidden', 'true');", js)
        self.assertNotRegex(js, re.compile(r"rm\.innerHTML\s*=\s*['\"]<i class=", re.MULTILINE))

    def test_editor_icon_delete_buttons_have_accessible_names(self):
        js = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")

        self.assertIn('aria-label="Delete statement ${idx + 1}"', js)
        self.assertIn('aria-label="Delete sequence option ${idx + 1}"', js)
        self.assertIn('aria-label="Delete option ${idx + 1}"', js)
        self.assertIn('<i class="fas fa-trash" aria-hidden="true"></i>', js)

    def test_mobile_exam_header_uses_compact_two_row_layout(self):
        css = (ROOT / "assets/css/exam-enhancements.css").read_text(encoding="utf-8")
        mobile_block = css[css.index("@media (max-width: 760px)") :]

        self.assertRegex(
            mobile_block,
            r"\.exam-header\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;",
        )
        self.assertRegex(mobile_block, r"\.exam-info-header\s*\{[\s\S]*?flex-direction:\s*row;")
        self.assertRegex(mobile_block, r"\.exam-info-header\s*\{[\s\S]*?grid-column:\s*1\s*/\s*-1;")
        self.assertRegex(mobile_block, r"\.exam-progress\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+auto\s+auto;")
        self.assertRegex(mobile_block, r"\.exam-header\s+\.exam-timer\s*\{[\s\S]*?min-width:\s*5\.7rem;")
        self.assertRegex(
            mobile_block,
            r"body:has\(#exam-screen\.screen\.active\)\s+\.theme-controls\s*\{[\s\S]*?display:\s*none;",
        )


if __name__ == "__main__":
    unittest.main()
