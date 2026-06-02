# Data Formats and Question Schema

> ℹ️ **Examples only:** This document references IDs like `ai900`/`ai102` purely as placeholders. The public repository does **not** include official dumps—store them privately and import them locally.

## Question Data Structure

All exam questions follow a standardized JSON schema:

### Standard Question Schema

```json
{
  "id": 1,
  "module": "MODULE_NAME",
  "question": "Question text here?",
  "options": [
    "Option A",
    "Option B",
    "Option C",
    "Option D"
  ],
  "correct": 0,
  "explanation": "Detailed explanation of the correct answer",
  "question_type": "STANDARD",
  "question_images": [
    {"filename": "diagram1.jpg"}
  ],
  "explanation_images": [
    {"filename": "explanation1.png"}
  ]
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | number | ✅ Yes | Unique question identifier |
| `module` | string | ⚠️ Optional | Module/category for balanced sampling (e.g., "AI_WORKLOADS") |
| `question` | string | ✅ Yes | Question text (markdown supported) |
| `options` | string[] | ✅ Yes | Array of answer options |
| `correct` | number or number[] | ✅ Yes | Index of correct answer(s). Single number for STANDARD, array for MULTI |
| `explanation` | string | ⚠️ Optional | Detailed explanation shown after revealing answer |
| `question_type` | string | ⚠️ Optional | Type of question (see below) |
| `question_images` | object[] | ⚠️ Optional | Images to display with question |
| `explanation_images` | object[] | ⚠️ Optional | Images to display with explanation |

---

## Question Types

### STANDARD (Single Choice)
Traditional multiple choice with one correct answer.

```json
{
  "question_type": "STANDARD",
  "correct": 2,
  "options": ["Option A", "Option B", "Option C", "Option D"]
}
```

---

### MULTI (Multiple Choice)
Multiple correct answers must be selected.

```json
{
  "question_type": "MULTI",
  "correct": [0, 2],
  "options": ["Option A", "Option B", "Option C", "Option D"]
}
```

**Note**: If `correct` is an array and `question_type` is not specified, it defaults to MULTI.

---

### SEQUENCE (Ordering)
User must arrange items in the correct order.

```json
{
  "question_type": "SEQUENCE",
  "options": ["Step 1", "Step 2", "Step 3", "Step 4"],
  "correct": [0, 1, 2, 3]
}
```

---

### DRAG_DROP_SELECT
Select N items from a list of options.

```json
{
  "question_type": "DRAG_DROP_SELECT",
  "options": ["Item A", "Item B", "Item C", "Item D", "Item E"],
  "correct": [0, 2, 4],
  "drag_select_required": 3
}
```

**Required field**: `drag_select_required` - number of items to select

---

### YES_NO_MATRIX
Answer Yes/No for each statement.

```json
{
  "question_type": "YES_NO_MATRIX",
  "statements": [
    "Statement 1 is true",
    "Statement 2 is false",
    "Statement 3 is true"
  ],
  "correct": [0, 1, 0]
}
```

**Required field**: `statements` - array of statements
**Note**: `correct` contains numeric Yes/No values (`0 = Yes, 1 = No`). Boolean values are rejected by the app validator and by `tools/validate-exam-packs.py`.

---

### HOTSPOT (Planned)
Click on specific areas of an image.

```json
{
  "question_type": "HOTSPOT",
  "question_images": [{"filename": "diagram.jpg"}],
  "correct": [{"x": 100, "y": 150, "radius": 20}]
}
```

**Note**: Planned only. The current runtime validator and `tools/validate-exam-packs.py` accept `STANDARD`, `MULTI`, `SEQUENCE`, `DRAG_DROP_SELECT`, and `YES_NO_MATRIX`.

---

## Image Handling

### Image Paths

All image filenames are relative to the exam's `images/` folder:

```
user-content/exams/<exam-id>/
├── dump.json
├── metadata.json
└── images/
    ├── question1.jpg
    ├── diagram2.png
    └── explanation3.png
```

In `dump.json`:
```json
{
  "question_images": [{"filename": "question1.jpg"}],
  "explanation_images": [{"filename": "explanation3.png"}]
}
```

### Image Loading Behavior

**Server Mode** (`python server.py`):
```
→ user-content/exams/{examId}/images/{filename}
```

**File Mode** (double-click `index.html`):
```
→ May fail due to CORS restrictions
→ Use server mode for reliable image loading
```

---

## Storage Locations

### Browser Storage

The simulator uses browser storage for local persistence. Imported exam content and detailed progress are stored in IndexedDB, with legacy localStorage mirrors read for backwards compatibility:

```javascript
const examId = 'your-exam-id';

// Questions, metadata, and detailed progress
IndexedDB['ExamContentDB'].exams;
IndexedDB['ExamContentDB'].progress;

// Legacy compatibility mirrors
localStorage[`custom_${examId}_questions`];
localStorage[`exam_metadata_${examId}`];
localStorage[`${examId}_progress`];

// Settings
localStorage['exam_activation_config'];
localStorage['theme']                   // dark or light
```

### Server-Side Storage (Optional)

Pre-installed exams visible to all users:

```
user-content/exams/
├── ai900/
│   ├── dump.json         ← Questions (required)
│   ├── metadata.json     ← Exam info (optional)
│   └── images/           ← Images (optional)
└── ai102/
    └── (same structure)
```

---

## Exam Metadata

Optional `metadata.json` provides rich exam information:

```json
{
  "id": "ai900",
  "name": "AI-900",
  "fullName": "Azure AI Fundamentals",
  "duration": 45,
  "questionCount": 45,
  "totalQuestions": 137,
  "passScore": 75,
  "badge": "Fundamentals",
  "icon": "fas fa-brain",
  "vendor": "Microsoft",
  "certificationCode": "AI-900",
  "domains": ["AI", "Cloud"],
  "level": "Fundamentals",
  "productFamily": "Azure",
  "contentType": "practice-exam",
  "commercialStatus": "free",
  "modules": [
    {
      "icon": "fas fa-brain",
      "name": "AI Workloads & Services"
    },
    {
      "icon": "fas fa-robot",
      "name": "Machine Learning Principles"
    }
  ],
  "hasImages": true
}
```

### Metadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Exam identifier (must match folder name) |
| `name` | string | Short name (e.g., "AI-900") |
| `fullName` | string | Full exam name |
| `duration` | number | Exam duration in minutes |
| `questionCount` | number | Questions per exam attempt |
| `totalQuestions` | number | Total questions in database |
| `passScore` | number | Passing score percentage (70-100) |
| `badge` | string | Badge text (e.g., "Fundamentals") |
| `icon` | string | Font Awesome icon class |
| `vendor` | string | Certification vendor or publisher used by library filters |
| `certificationCode` | string | Public exam/certification code used by search and filters |
| `domains` | string[] | Vendor-neutral domains such as Cloud, Security, Networking, AI, Data, DevOps |
| `level` | string | Certification level or audience, e.g., Fundamentals, Associate, Professional, Leadership |
| `productFamily` | string | Product or certification family, e.g., Azure, Cisco Certifications, CompTIA |
| `contentType` | string | Pack shape, e.g., practice-exam, preview, study-bank, lab-style, case-study |
| `commercialStatus` | string | Publication/licensing status, e.g., free, preview, pro-preview, pro. This is controlled during publication, not by the normal browser editor. |
| `modules` | object[] | List of exam modules |
| `hasImages` | boolean | Whether exam includes images |

Public packs should include the library taxonomy fields (`vendor`, `certificationCode`, `domains`, `level`, `productFamily`, `contentType`, and publication-controlled `commercialStatus`) so search, sort, filters, cards, and health reports keep working as the catalog grows across vendors. Imported/private packs can omit them; the simulator falls back to generic metadata.

When preparing a public pack in the browser editor, complete the visible library metadata fields first. The editor intentionally does not expose `commercialStatus`; set or review that field only in the publication/licensing workflow.

**If no metadata.json**: Simulator auto-generates basic metadata using exam ID.

---

## Import/Export

### Exporting Questions

From the editor:
1. Open `editor.html`
2. Select exam
3. Click "Export" button
4. Downloads `{examId}_questions.json`

### Importing Questions

**Method 1: Drag & Drop**
1. Drag JSON file onto homepage
2. Questions saved to browser storage
3. Exam card appears

**Method 2: Manual Placement**
1. Create folder: `user-content/exams/{examId}/`
2. Place `dump.json` in folder
3. Optionally add `metadata.json` and `images/`
4. Restart server

**Method 3: Editor Import**
1. Open `editor.html`
2. Click "Import" button
3. Select JSON file
4. Questions loaded to editor

---

## Data Validation

Run the repository validator before sharing or publishing packs:

```bash
python tools/validate-exam-packs.py --root user-content/exams
```

For a non-blocking catalog quality overview, run:

```bash
python tools/validate-exam-packs.py --root user-content/exams --health-report
```

The health report assigns each pack a `score:/100` and a `Ready`, `Review`, or `Needs work` label. The score combines metadata completeness, schema validity, manifest integrity, image-reference health, and suspicious duplicate question text. It also prints question counts and the question-type mix for quick catalog review.

### Required Validation

When importing questions, ensure:
- ✅ Valid JSON array
- ✅ Each question has `id`, `question`, `options`, `correct`
- ✅ `correct` index matches `options` length
- ✅ Image filenames exist in `images/` folder
- ✅ Question types are valid

### Common Validation Errors

**Invalid JSON**:
```json
// ❌ Missing comma
{"id": 1}
{"id": 2}

// ✅ Correct
[{"id": 1}, {"id": 2}]
```

**Wrong correct index**:
```json
// ❌ Index out of bounds
{
  "options": ["A", "B", "C"],
  "correct": 3  // Only 0-2 are valid
}

// ✅ Correct
{
  "options": ["A", "B", "C"],
  "correct": 2
}
```

**Missing images**:
```json
// ❌ File doesn't exist
{"question_images": [{"filename": "nonexistent.jpg"}]}

// ✅ Correct
{"question_images": [{"filename": "diagram1.jpg"}]}
```

---

## Best Practices

### Question Design
- Keep question text concise and clear
- Use 4 options for STANDARD questions
- Provide detailed explanations
- Include images for visual concepts

### File Organization
```
user-content/exams/my-exam/
├── dump.json              # All questions
├── metadata.json          # Exam settings
└── images/
    ├── module1/           # Organized by module
    │   ├── q1.png
    │   └── q2.png
    └── module2/
        └── q3.png
```

### Image Optimization
- Use JPEG for photos (80-90% quality)
- Use PNG for diagrams and screenshots
- Resize large images (max 1920px width)
- Compress images before adding
- Use descriptive filenames

### Metadata Completeness
Always provide `metadata.json` with:
- Accurate question counts
- Realistic duration
- Appropriate pass score
- Module breakdown

---

## Migration Notes

### From v1.x to v2.0

No breaking changes. All existing data formats are compatible.

**Optional improvements**:
- Add `question_type` to questions for better UI
- Add `modules` to metadata for better organization
- Optimize images for faster loading

---

## See Also

- [README.md](../README.md) - Main documentation
- [PRIVACY-AND-STORAGE.md](../PRIVACY-AND-STORAGE.md) - Privacy and storage details
- [HOW-TO-DISTRIBUTE.md](HOW-TO-DISTRIBUTE.md) - Distribution guide
