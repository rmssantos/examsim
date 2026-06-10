# Custom Packs Folder

This folder is for storing your own question packs that can be loaded into the editor.

## Usage

1. Place a JSON file named `<exam-code>.json` in this folder
   - Examples: `myexam.json`, `certification.json`, `practice.json`

2. In the editor:
   - Set the exam selector to **Custom**
   - Enter your exam code (e.g., `myexam`)
   - Click **Load** to import the questions from `custom-packs/myexam.json`

3. The simulator stores questions locally in browser storage. Current versions use IndexedDB for imported content and may keep this legacy localStorage key for compatibility:
   ```
   custom_<exam-code>_questions
   ```

> Older setups used a folder named `exam-dumps/` for the same purpose; the app still reads
> that location as a fallback, but `custom-packs/` is the supported name going forward.

## File Format

Your JSON file should contain an array of question objects:

```json
[
  {
    "id": 1,
    "module": "MODULE_NAME",
    "question": "Question text?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct": 0,
    "explanation": "Explanation text",
    "question_type": "STANDARD"
  }
]
```

See [docs/Pack-Format.md](../docs/Pack-Format.md) for complete schema documentation.

## Notes

- **Custom packs are NOT automatically loaded** - you must explicitly load them via the editor
- After loading and editing in the editor, click **Save** to persist to browser storage
- Questions persist in your browser even after closing the tab
- To share your custom pack, export it as JSON from the editor
- Only publish content that you created or are authorized to redistribute
