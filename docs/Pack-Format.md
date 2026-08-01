# Data Formats and Question Schema

> **Examples only:** This document uses generic sample IDs. Only publish content that you created or are authorized to redistribute.

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
| `id` | string or safe integral number | ✅ Yes | Unique canonical question identifier. Strings are trimmed and each internal whitespace run is collapsed to one ASCII space. Integral numbers in JavaScript's safe range use their canonical decimal form, so numeric `1` and string `"1"` are the same ID. The canonical ID must be well-formed Unicode and contain at most 120 UTF-16 code units. |
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

## Hands-on Labs (`labs` array)

A pack can ship hands-on **lab guides** alongside its questions. Labs are
non-graded, step-by-step exercises the learner runs in their own cloud account.
They are independent of the exam engine (scoring is untouched) and render in a
standalone reader at `labs.html?exam=<exam-id>`.

When labs are present, the pack's content file holds an object with both
`questions` and `labs` (rather than a bare array of questions):

```json
{
  "questions": [ ... ],
  "labs": [
    {
      "id": "lab-az104-rbac-rg-reader",
      "domain": "AZ104-1",
      "title": "Grant least-privilege access with an RBAC role at resource-group scope",
      "objective": "Assign the built-in Reader role to a user at a single resource group's scope.",
      "prerequisites": [
        "An Azure free account with an active subscription",
        "Azure CLI installed and signed in with az login"
      ],
      "freeTierOnly": true,
      "estCost": "Expected cost: ~0 EUR. Role assignments are free; delete the group at the end.",
      "steps": [
        {
          "n": 1,
          "instruction": "Create a sandbox resource group.\n\n`az group create --name rg-lab-rbac --location westeurope`",
          "expected": "JSON output where \"provisioningState\" is \"Succeeded\"."
        }
      ],
      "expectedResult": "The test user has Reader on exactly one resource group.",
      "cleanup": [
        "`az group delete --name rg-lab-rbac --yes --no-wait`"
      ],
      "references": [
        {
          "label": "Assign Azure roles using Azure CLI (Microsoft Learn)",
          "url": "https://learn.microsoft.com/azure/role-based-access-control/role-assignments-cli"
        }
      ],
      "sourceVerifiedOn": "2026-06-14",
      "objectiveVersion": "AZ-104 skills measured as of April 17, 2026"
    }
  ]
}
```

### Lab Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ Yes | Unique lab identifier (must be unique within the `labs` array) |
| `domain` | string | ✅ Yes | Objective-domain code the lab maps to (e.g. `AZ104-1`) |
| `title` | string | ✅ Yes | Short lab title |
| `objective` | string | ✅ Yes | What the learner accomplishes and why it maps to the exam |
| `prerequisites` | string[] | ✅ Yes | Non-empty list of non-empty strings (accounts, tools, permissions, shell) |
| `freeTierOnly` | boolean | ✅ Yes | Must be a real boolean. `true` if the lab stays within free-tier/no-cost resources |
| `estCost` | string | ✅ Yes | Plain-language cost callout (hard gate: a paid lab can never ship without one) |
| `steps` | object[] | ✅ Yes | Non-empty ordered list (see step shape below) |
| `expectedResult` | string | ✅ Yes | The end state after all steps succeed |
| `cleanup` | string[] | ✅ Yes | Non-empty teardown list (hard gate: every lab must tell the learner how to tear down) |
| `references` | object[] | ✅ Yes | Non-empty list of `{label, url}`; every `url` must be an official-documentation HTTPS link (see below) |
| `sourceVerifiedOn` | string | ✅ Yes | ISO date (`YYYY-MM-DD`) the steps were last verified against the docs |
| `objectiveVersion` | string | ✅ Yes | The skills-measured/objective version the lab was authored against |

**Step shape** (each entry in `steps`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `n` | number | ✅ Yes | Step number (integer) |
| `instruction` | string | ✅ Yes | What to do (markdown supported, including inline command blocks) |
| `expected` | string | ✅ Yes | What the learner should observe if the step worked |
| `image` | object | ⚠️ Optional | `{ "filename": "..." }`, resolved against the exam's `images/` folder like question images |

### Reference URL gate

Lab references are external links the learner clicks, so they are restricted to
official documentation hosts over HTTPS. The validator (`is_official_doc_url`)
accepts `learn.microsoft.com`, `docs.microsoft.com`, `azure.microsoft.com`,
`microsoft.com`, `docs.aws.amazon.com`, `aws.amazon.com`, `cloud.google.com`,
and their subdomains. Plain HTTP and any other host are rejected.

### Labs and metadata

When a pack ships labs, its `metadata.json` declares them:

- `labCount` (number) is **required** when the pack ships labs, and it must equal
  the actual number of labs. A non-zero `labCount` with no labs present is also
  rejected, since the count must match the labs that are there. The homepage entry
  point and the SEO landing section key off `labCount`.
- `labTopics` (string[], optional) is a teaser list of lab topics for the landing
  copy. It is independent of `labCount`: a free preview can list the full pack's
  lab topics (e.g. eight) while shipping a single free sample lab (`labCount: 1`).

See [Hands-on Labs metadata](#metadata-fields) for the metadata field entries and
[Data Validation](#data-validation) for how labs are checked.

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
├── sample100/
│   ├── dump.json         ← Questions (required)
│   ├── metadata.json     ← Exam info (optional)
│   └── images/           ← Images (optional)
└── sample200/
    └── (same structure)
```

---

## Exam Metadata

Optional `metadata.json` provides rich exam information:

```json
{
  "id": "sample100",
  "name": "SAMPLE-100",
  "fullName": "Sample Fundamentals",
  "duration": 45,
  "questionCount": 45,
  "totalQuestions": 137,
  "passScore": 75,
  "badge": "Fundamentals",
  "icon": "fas fa-brain",
  "vendor": "Microsoft",
  "certificationCode": "SAMPLE-100",
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
| `name` | string | Short name (e.g., "SAMPLE-100") |
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
| `labCount` | number | Number of hands-on labs in the pack. Required when the pack ships labs; must equal the actual lab count (see [Hands-on Labs](#hands-on-labs-labs-array)) |
| `labTopics` | string[] | Optional teaser list of lab topics for landing copy; independent of `labCount` |

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

### Lab validation

When a pack includes a `labs` array, the validator also checks each lab
(see [Hands-on Labs](#hands-on-labs-labs-array)): unique `id`; the required text
fields (`domain`, `title`, `objective`, `expectedResult`, `estCost`,
`objectiveVersion`); a boolean `freeTierOnly`; an ISO `sourceVerifiedOn`;
non-empty `prerequisites`, `cleanup`, and `steps` (each step with integer `n`,
`instruction`, and `expected`); and non-empty `references` whose URLs all point
to official documentation over HTTPS. A lab step's optional `image` must resolve
inside the exam's `images/` folder. `metadata.labCount` must be present and equal
the number of labs.

### Required Validation

When importing questions, ensure:
- ✅ Valid JSON array
- ✅ Each question has `id`, `question`, `options`, `correct`
- ✅ `correct` index matches `options` length
- ✅ Image filenames exist in `images/` folder
- ✅ Question types are valid

### Cardinality and import safety limits

The browser and repository validator apply the same generous structural ceilings.
They are above every bundled pack, but keep an imported JSON document from creating
unbounded render or storage work:

- A question can contain at most 50 options, 50 statements, and 50 entries in a
  `correct` array.
- A question `id` must be a non-empty string or safe integral number. String IDs
  are canonicalized by trimming surrounding whitespace and collapsing internal
  whitespace runs to one ASCII space. Numeric IDs use canonical decimal text, so
  string/number equivalents and whitespace variants count as duplicates. The
  canonical ID must be unique, well-formed Unicode and at most 120 UTF-16 code
  units.
- `MULTI` and `DRAG_DROP_SELECT` answers must use unique option indices.
  `DRAG_DROP_SELECT` must declare `drag_select_required`, and it must equal the
  number of correct selections.
- A question can contain at most 20 image references across `question_images` and
  `explanation_images`, plus 20 source `references`.
- A pack can contain at most 50 labs.
- Each lab can contain at most 100 steps, including at most 20 step image
  references.
- Each lab can contain at most 25 prerequisites, 25 cleanup entries, and 25 official-documentation references.
- Every metadata list can contain at most 100 items, including nested lists such
  as mapped modules or feature highlights.
- Taxonomy lists use the tighter limit of 20 entries for taxonomy lists such as
  `domains`.
- Metadata taxonomy fields and taxonomy-list entries allow at most 200 UTF-16
  code units for each taxonomy value. When present, each must be a non-empty,
  well-formed string.
- The generic string ceiling is 5,000 UTF-16 code units for any other metadata
  string.
- Metadata objects allow at most 100 keys per metadata object and 200 UTF-16
  code units per metadata key.
- Metadata nesting can extend at most 10 levels below the metadata root (the
  root has depth 0), with at most 5,000 total nodes in the metadata tree.
- Browser imports snapshot only own, enumerable, string-keyed data properties,
  matching what JSON files can represent. Accessor properties and non-plain
  containers are rejected before validation; symbol and non-enumerable
  properties are not copied into the stored pack.

ZIP imports are decompressed in a dedicated Web Worker using the self-hosted JSZip
copy. The worker counts actual decompressed bytes emitted by every non-directory
entry, including files the importer otherwise ignores. Declared ZIP sizes are only
an early preflight hint. Per-file and shared package/image byte limits are enforced
while streaming, and the page terminates an extraction that exceeds its timeout.
Only bounded JSON and image buffers return to the main thread for decoding and Blob
creation.

For recovery only, the browser can continue loading a pack read from browser
storage that was saved by an older Examplar version when its otherwise valid
question IDs exceed 120 units. This exception follows internal storage-read
provenance; serialized `source` or `storage` fields cannot enable it. The browser
shows a warning and preserves the IDs unchanged. If two distinct long canonical
IDs produce the same historical FNV-1a-plus-80-character key, validation reports a
legacy storage identity collision and the whole stored pack is quarantined instead
of risking crossed progress records. New imports, editor saves and repository
validation remain strict, so correct those IDs before re-exporting or re-importing
the pack.

Before JSZip parses the archive, the worker validates the raw end-of-directory
and central-directory records, accepts printable ASCII entry names only, rejects
duplicate or ambiguous paths, enforces the entry and compressed-file ceilings,
and rejects malformed, multi-disk, or ZIP64 archives. ZIP import therefore
requires an HTTP(S) origin: use the public site or run `python server.py`; direct
`file://` mode continues to support JSON import but not ZIP extraction.

Images and pack records use separate browser databases. A detected write failure
restores the previous image set before returning an error, but this is a
compensating transaction rather than a single crash-atomic commit across both
databases. If the browser is forcibly terminated during import, re-import the ZIP
to reconcile its pack and image set.

When multiple `dump.json` or `metadata.json` files exist, the shortest normalized
path wins; equal-length paths use lexical order. Image paths are flattened to a
validated safe basename. If multiple safe paths have the same basename, the
shortest path (then lexical order) wins, while every duplicate is still decompressed
and charged to the package and image budgets.

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
