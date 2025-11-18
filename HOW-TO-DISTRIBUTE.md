# How to Distribute Exam Packs

## Overview

The Azure AI Exam Simulator is designed as a **simulator/editor platform** that users can customize with their own exam content. The platform itself does NOT include any exam dumps - users must import their own content.

> ⚠️ **Compliance reminder:** Keep official exam dumps (AI-900, AI-102, etc.) in a private repository or encrypted storage. This public repo only ships the simulator code plus empty drop-zones so it can stay fully open source.

### Recommended Two-Repo Workflow

1. **Public repo (this one):** contains only the simulator (`portable/`), docs, and empty folders (`images/`, `user-content/exams/`).
2. **Private repo or storage bucket:** holds proprietary exam packs such as `ai900-exam-pack.zip` or `ai102-v2.zip`.
3. **Distribution:** share the public simulator ZIP openly, then send secure links (or private Git tags) for the exam packs to authorized teammates.
4. **Automation tip:** add a CI step that zips the simulator from the public repo and attaches it to a Release, while another private pipeline builds encrypted exam packs.

## Distributing the Portable Simulator

The entire platform lives inside the `portable/` folder. To share it:

1. **Zip the folder** (e.g., `portable.zip`) or publish it as a GitHub Release asset.
2. Recipients **unzip and double-click `index.html`**—no installers, admin rights, or runtimes required.
3. Optional: include a short `README-team.md` telling them how to launch `python server.py` if they later want automatic exam detection.
4. Encourage creators to open `editor.html`, build exams, export JSON, and share those files with the rest of the team.

This “plug-and-play” packaging works perfectly for classroom handouts, corporate training kits, or USB distributions.

## Distribution Model

### What You Distribute

1. **The Simulator Platform** (this portable folder)
   - HTML/CSS/JS files
   - Empty `user-content/exams/` directory
   - Documentation

2. **Exam Packs Separately** (via cloud storage, etc.)
   - Each exam as a standalone package
   - Users download and import what they need
   - Never push these packs to the public Git history

## Creating Exam Packages for Distribution

### Structure of an Exam Package

Each exam should be packaged with this structure:

```
<exam-id>-exam-pack.zip
├── dump.json              # Question data (required)
├── metadata.json          # Exam information (optional but recommended)
└── images/                # Image assets (if applicable)
    ├── image1.jpg
    ├── image2.png
    └── ...
```

### Required File: dump.json

This is an array of question objects:

```json
[
  {
    "id": 1,
    "module": "AI_WORKLOADS",
    "question": "What is Azure Cognitive Services?",
    "options": [
      "A cloud-based AI service",
      "A database service",
      "A networking service",
      "A storage service"
    ],
    "correct": 0,
    "explanation": "Azure Cognitive Services provides AI capabilities...",
    "question_type": "STANDARD",
    "question_images": [
      {"filename": "diagram1.jpg"}
    ],
    "explanation_images": [
      {"filename": "explanation1.jpg"}
    ]
  },
  ...
]
```

**Important Notes:**
- `id`: Unique question identifier (number)
- `correct`: Can be a single index (0-3) or array of indices [0,2] for multi-select
- `question_type`: STANDARD, MULTI, SEQUENCE, DRAG_DROP_SELECT, YES_NO_MATRIX, HOTSPOT
- Image filenames are relative to the `images/` folder

### Optional File: metadata.json

Provides rich information about the exam:

```json
{
  "id": "ai900",           // Identifier used at runtime (example only)
  "name": "AI-900",
  "fullName": "Azure AI Fundamentals",
  "duration": 45,
  "questionCount": 45,
  "totalQuestions": 137,
  "passScore": 75,
  "badge": "Fundamentals",
  "icon": "fas fa-brain",
  "modules": [
    "AI_WORKLOADS",
    "MACHINE_LEARNING",
    "COMPUTER_VISION",
    "NLP",
    "GENERATIVE_AI"
  ],
  "hasImages": true
}
```

> Use `ai900`/`ai102` identifiers only inside **private** packs. The public repo purposefully excludes these files.

If metadata.json is not provided, the simulator will auto-generate basic metadata.

### Images Folder

- **Format**: JPG, PNG, GIF
- **Naming**: Use descriptive, unique filenames
- **Organization**: Can use subfolders (e.g., `ai102/question1.png`)
- **Paths in JSON**: Relative to `images/` directory

## Distribution Workflow

### Step 1: Prepare the Simulator

1. Clean the `user-content/exams/` directory (remove any example content)
2. Ensure documentation is up to date
3. Test that the simulator loads without any exams (shows import screen)

### Step 2: Package Each Exam

For each exam you want to distribute:

```powershell
cd C:\apps\ai900\portable\user-content\exams\<exam-id>
# Create a zip with dump.json, metadata.json, and images/
Compress-Archive -Path dump.json, metadata.json, images -DestinationPath ..\..\private\<exam-id>-exam-pack.zip
```

### Step 3: Upload Exam Packs

Upload each exam package to:
- Google Drive / OneDrive
- GitHub Release
- Your own hosting
- File sharing service

### Step 4: Provide Instructions to Users

## User Instructions

### How Users Import Exam Packs

#### Method 1: Manual Import (Recommended)

1. Download the exam pack (e.g., `ai900-exam-pack.zip` from your private store)
2. Extract the ZIP file
3. Copy the contents to:
   ```
   portable/user-content/exams/[exam-id]/
   ```

  Example for a private AI-900 pack:
   ```
   portable/user-content/exams/ai900/
   ├── dump.json
   ├── metadata.json
   └── images/
       └── (all image files)
   ```

4. Open `index.html` - the exam will appear automatically

#### Method 2: Drag & Drop (Future Feature)

The simulator includes a drag-and-drop interface, but for now, manual copying is the most reliable method.

### Directory Structure

After importing exams, the structure should look like:

```
portable/
├── index.html
├── exam.html
├── editor.html
├── exam-manager.js
├── image-loader.js
├── ... (other core files)
└── user-content/
    ├── README-IMPORT.md
    └── exams/
    ├── <exam-id-a>/
    │   ├── dump.json
    │   ├── metadata.json
    │   └── images/
    │       ├── image1.jpg
    │       └── image2.jpg
    └── <exam-id-b>/
      ├── dump.json
      ├── metadata.json
      └── images/
        └── question-artifacts
```

## Example Distribution Strategy

### Option A: Separate Downloads

1. **Simulator**: `exam-simulator-v1.0.zip` (5 MB, public)
2. **AI-900 Pack**: `ai900-questions.zip` (15 MB, private)
3. **AI-102 Pack**: `ai102-questions.zip` (50 MB, private)

Users download the simulator once, then add exam packs as needed.

### Option B: All-in-One Package

Bundle the simulator with all available exams for users who want everything:

`complete-exam-bundle.zip` (70 MB – distribute only through private, access-controlled channels)
- Includes simulator + all exam packs pre-installed

## Creating Your Own Exam Packs

### For Content Creators

1. **Use the Built-in Editor**
   - Open `editor.html`
   - Create/edit questions
   - Export as JSON

2. **Package Your Exam**
   ```bash
   # Structure your exam
   mkdir my-custom-exam
   cd my-custom-exam

   # Create dump.json with your questions
   # Create metadata.json with exam info
   # Add images/ folder if needed

   # Package it
   zip -r my-custom-exam.zip dump.json metadata.json images/
   ```

3. **Share Your Package**
   - Upload to your preferred platform
   - Share the download link
   - Include import instructions

## Best Practices

### For Distributers

- Keep exam packs under 100 MB when possible
- Optimize images (compress, resize if needed)
- Include clear README with each pack
- Version your exam packs (e.g., `ai900-v1.2.zip`)
- Test imports before distributing
- Never commit or push official exam dumps to public repositories
- Double-check `.gitignore` before every commit to ensure `user-content/ai900*`, `user-content/ai102*`, and `images/` remain empty

### For Users

- Only import exams from trusted sources
- Back up your `user-content/` folder regularly
- Check exam metadata before importing
- Remove exams you don't need to save space

## Legal & Ethical Considerations

**IMPORTANT:**

- This simulator is an **educational tool**
- Users are responsible for the content they import
- Ensure you have the right to use any exam content
- Respect intellectual property and copyright laws
- Do not distribute copyrighted exam materials without permission

## Troubleshooting

### Exam Not Appearing After Import

- Check that dump.json is in the correct location
- Verify JSON syntax (use a validator)
- Check browser console (F12) for errors
- Ensure exam ID matches folder name

### Images Not Loading

- Verify image paths in dump.json match actual files
- Check that images are in the `images/` subfolder
- Ensure filenames are case-sensitive correct
- Try refreshing the page (Ctrl+F5)

### Creating New Exam from Scratch

1. Create folder: `user-content/exams/my-exam/`
2. Create minimal `dump.json`: `[]`
3. Open `editor.html`
4. Select your exam
5. Start adding questions
6. Export when done

## Support

For issues or questions:
- Check `user-content/README-IMPORT.md`
- Review documentation in `docs/`
- Open an issue on the project repository

---

**Remember**: The simulator is the platform, exam packs are the content. Keep them separate for flexibility and legal clarity.
