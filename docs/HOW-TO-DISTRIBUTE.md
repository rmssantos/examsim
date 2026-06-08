# Distributing Exam Packs

Examplar separates the simulator from exam content. A pack can be imported into
the public site, used locally, or installed in a self-hosted copy.

Only distribute content that you created or are authorized to redistribute.
Do not publish copied certification questions or proprietary material.

## Supported Pack Shapes

### Question Array

```json
[
  {
    "id": 1,
    "question": "Example question?",
    "options": ["A", "B", "C", "D"],
    "correct": 0,
    "explanation": "Explanation",
    "question_type": "STANDARD"
  }
]
```

### Combined JSON Pack

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

### ZIP Pack

```text
sample-exam.zip
|-- dump.json
|-- metadata.json
`-- images/
    `-- diagram.png
```

`dump.json` is required. Metadata and images are optional.

## Importing a Pack

1. Open the Examplar homepage.
2. Drag the JSON or ZIP file onto the import area, or use the file picker.
3. Review the detected exam name and content.
4. Start the exam or open it in the editor.

The imported content is stored in that browser profile.

## Installing a Pack Locally

For automatic discovery through `server.py`, create:

```text
user-content/exams/sample-exam/
|-- dump.json
|-- metadata.json
`-- images/
```

Then start:

```powershell
python server.py
```

The folder name is the authoritative exam ID. The metadata ID must match the
folder name; pack validation fails when they differ.

## Creating a Pack

1. Open `editor.html`.
2. Create or select an exam.
3. Add questions and metadata.
4. Export JSON.
5. Test the exported pack in a clean browser profile.

For repository-hosted packs, add the files under `user-content/exams/<exam-id>/`,
register the ID in `user-content/exams/index.json`, and generate a manifest.

```powershell
python tools/validate-exam-packs.py --root user-content/exams --write-manifest
python tools/validate-exam-packs.py --root user-content/exams --check-manifest
```

## Validation

Before sharing a pack:

```powershell
python tools/validate-exam-packs.py --root user-content/exams
```

Check that:

- every question has a unique ID;
- answer indices are valid;
- question types match the supported schema;
- image filenames are safe and resolve inside the pack;
- metadata counts and exam IDs are correct;
- referenced content is licensed for distribution.

See [Data-and-Dumps.md](Data-and-Dumps.md) for the complete schema.

## Security

Import only packs from trusted sources. JSON, ZIP entries, metadata, URLs, and
filenames are untrusted input.

Do not include:

- credentials or license material;
- personal data;
- analytics or browser-storage exports;
- executable files;
- absolute local paths;
- content that cannot legally be redistributed.

## Updating a Shared Pack

Use stable question IDs so existing progress can continue to map to the same
items. Update metadata review dates and objective versions when the syllabus
changes, regenerate the manifest, and retest imports before publishing.
