import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class EditorAttributeSafetyTests(unittest.TestCase):
    def test_option_values_are_assigned_as_dom_properties(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not available")

        editor_source = (ROOT / "assets/js/editor.js").read_text(encoding="utf-8")
        render_start = editor_source.index("  function renderForm()")
        render_end = editor_source.index("  function syncFromForm()", render_start)
        render_block = editor_source[render_start:render_end]
        self.assertNotIn('value="${escapeHtml(', render_block)
        self.assertNotIn("row.innerHTML", render_block)
        self.assertIn("createEditorTextInput('opt-text', idx, opt)", render_block)

        payloads = [
            '" autofocus onfocus="window.__editorAttributeInjected=true',
            """single ' and double " quotes data-owned="false""",
        ]
        node_script = r"""
const fs = require('fs');
const { chromium } = require('playwright');
const source = fs.readFileSync(process.argv[1], 'utf8');
const payloads = JSON.parse(process.argv[2]);
const start = source.indexOf('  function createEditorTextInput');
const end = source.indexOf('  function createOptionDeleteButton', start);
if (start < 0 || end < 0) throw new Error('Editor input factory not found');
const factorySource = source.slice(start, end);
const deleteStart = end;
const deleteEnd = source.indexOf('  function renderForm', deleteStart);
if (deleteEnd < 0) throw new Error('Editor delete-button factory not found');
const deleteFactorySource = source.slice(deleteStart, deleteEnd);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="options"></main>');
    await page.addScriptTag({
      content: `${factorySource}
${deleteFactorySource}
window.__createEditorTextInput = createEditorTextInput;
window.__createOptionDeleteButton = createOptionDeleteButton;`
    });
    const result = await page.evaluate(
      (payloads) => {
        window.__editorAttributeInjected = false;
        const container = document.getElementById('options');
        payloads.forEach((payload, index) => {
          container.appendChild(
            window.__createEditorTextInput('opt-text', index, payload)
          );
        });
        const inputs = Array.from(container.querySelectorAll('.opt-text'));
        const deleteButtons = ['statement', 'sequence option', 'option'].map(
          (itemLabel) => {
            const button = window.__createOptionDeleteButton(1, itemLabel);
            container.appendChild(button);
            return {
              label: button.getAttribute('aria-label'),
              title: button.title,
              iconClass: button.querySelector('i')?.className,
              iconHidden: button.querySelector('i')?.getAttribute('aria-hidden')
            };
          }
        );
        inputs[0].focus();
        return {
          injected: window.__editorAttributeInjected,
          deleteButtons,
          inputs: inputs.map((input) => ({
            value: input.value,
            autofocus: input.hasAttribute('autofocus'),
            onfocus: input.hasAttribute('onfocus'),
            owned: input.hasAttribute('data-owned')
          }))
        };
      },
      payloads
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"""
        result = subprocess.run(
            [
                node,
                "-e",
                node_script,
                str(ROOT / "assets/js/editor.js"),
                json.dumps(payloads),
            ],
            capture_output=True,
            text=True,
            timeout=20,
            cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, msg=result.stderr)
        rendered = json.loads(result.stdout)
        self.assertFalse(rendered["injected"])
        self.assertEqual(
            [item["value"] for item in rendered["inputs"]],
            payloads,
        )
        for item in rendered["inputs"]:
            with self.subTest(value=item["value"]):
                self.assertFalse(item["autofocus"])
                self.assertFalse(item["onfocus"])
                self.assertFalse(item["owned"])
        self.assertEqual(
            [item["label"] for item in rendered["deleteButtons"]],
            ["Delete statement 2", "Delete sequence option 2", "Delete option 2"],
        )
        for button in rendered["deleteButtons"]:
            with self.subTest(label=button["label"]):
                self.assertEqual(button["title"], button["label"])
                self.assertEqual(button["iconClass"], "fas fa-trash")
                self.assertEqual(button["iconHidden"], "true")


if __name__ == "__main__":
    unittest.main()
