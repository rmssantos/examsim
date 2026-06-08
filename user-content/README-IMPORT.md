# Exam Import Guide

Examplar imports JSON and ZIP exam packs into browser storage.

Only import content from trusted sources and only share content that you are
authorized to redistribute.

## JSON Formats

### Question Array

```json
[
  {
    "id": 1,
    "module": "FOUNDATIONS",
    "question": "What is the correct answer?",
    "options": ["A", "B", "C", "D"],
    "correct": 0,
    "explanation": "Explanation here.",
    "question_type": "STANDARD"
  }
]
```

### Combined Pack

```json
{
  "id": "sample-exam",
  "metadata": {
    "name": "SAMPLE-100",
    "fullName": "Sample Practice Exam",
    "duration": 45,
    "questionCount": 40,
    "passScore": 70
  },
  "questions": []
}
```

## ZIP Format

A ZIP pack can contain:

```text
sample-exam.zip
|-- dump.json
|-- metadata.json
`-- images/
    |-- question.png
    `-- explanation.jpg
```

`dump.json` is required. `metadata.json` and `images/` are optional.

## Import Methods

### Drag and Drop

1. Open the homepage.
2. Drag a `.json` or `.zip` file onto the import area.
3. Wait for validation to complete.
4. Open the imported exam.

### File Picker

Use the Browse Files button in the import area and select the pack.

### Local Folder

When using `python server.py`, install a pack at:

```text
user-content/exams/<exam-id>/
|-- dump.json
|-- metadata.json
`-- images/
```

Refresh the homepage after adding the folder.

## Supported Question Types

- `STANDARD`: one correct option
- `MULTI`: multiple correct options
- `SEQUENCE`: arrange all items in order
- `DRAG_DROP_SELECT`: select a required number of items
- `YES_NO_MATRIX`: one Yes/No answer per statement (`0 = Yes`, `1 = No`)

`HOTSPOT` is not currently accepted by the runtime or pack validator.

## Images

Reference images with safe filenames that do not contain directory separators:

```json
{
  "question_images": [{"filename": "network-diagram.png"}],
  "explanation_images": [{"filename": "network-answer.png"}]
}
```

Supported formats include JPEG, PNG, GIF, and WebP where the browser supports
them.

Do not use:

- absolute paths;
- directory separators or nested paths;
- parent traversal such as `../`;
- drive letters;
- URL schemes inside filenames;
- executable or script files.

## Validation Rules

Imports are checked for:

- required question fields;
- supported question types;
- valid answer indices;
- bounded file and archive sizes;
- safe ZIP entry names;
- safe image filenames;
- valid metadata and exam IDs.

Repository packs can be checked with:

```powershell
python tools/validate-exam-packs.py --root user-content/exams
```

## Storage

Imported content and progress remain in that browser profile. Clearing site data
can remove them. Export content and progress before clearing browser storage or
moving to another device.

## Troubleshooting

### Import Rejected

- Validate the JSON syntax.
- Confirm the root is a question array or combined pack object.
- Check that every question has `id`, `question`, `options`, and `correct`.
- Verify answer indices are within the options array.

### Images Missing

- Confirm the files exist inside `images/`.
- Match filename case exactly.
- Use relative paths only.
- Use `python server.py` for local editor image workflows.

### Exam Not Listed

- Refresh after a successful import.
- Check the browser console for validation errors.
- For folder-based packs, confirm the folder contains `dump.json`.

## Related Documentation

- [Question and metadata schema](../docs/Data-and-Dumps.md)
- [Pack distribution](../docs/HOW-TO-DISTRIBUTE.md)
- [Privacy and storage](../PRIVACY-AND-STORAGE.md)
