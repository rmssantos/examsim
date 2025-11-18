# Custom Exam Dumps Folder

This folder is for storing custom exam question files that can be loaded into the editor.

## Usage

1. Place a JSON file named `<exam-code>.json` in this folder
   - Examples: `myexam.json`, `certification.json`, `practice.json`

2. In the editor:
   - Set the exam selector to **Custom**
   - Enter your exam code (e.g., `myexam`)
   - Click **Load** to import the questions from `exam-dumps/myexam.json`

3. The simulator stores questions in browser localStorage under the key:
   ```
   custom_<exam-code>_questions
   ```

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

See [docs/Data-and-Dumps.md](../docs/Data-and-Dumps.md) for complete schema documentation.

## Notes

- **Custom exams are NOT automatically loaded** - you must explicitly load them via the editor
- After loading and editing in the editor, click **Save** to persist to localStorage
- Questions persist in your browser even after closing the tab
- To share your custom exam, export it as JSON from the editor
