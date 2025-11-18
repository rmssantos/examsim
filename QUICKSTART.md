# Quick Start Guide

Get up and running with the Azure AI Exam Simulator in under 5 minutes.

---

## ⚠️ Important Notice

**Educational Tool Only:** This simulator is for study and practice purposes. It is not affiliated with Microsoft or any certification authority. Official exam content and requirements may change. Always refer to official Microsoft certification documentation.

---

## ⚡ Fastest Way to Start

```bash
# 1. Navigate to portable folder
cd path/to/portable

# 2. Start server
python server.py

# 3. Browser opens automatically at http://localhost:8000
# 4. Click an exam card → Start practicing!
```

---

## 🎯 Two Usage Modes

### Mode 0: Portable Bundle (No Install Required)

| Best for | People who just want to unzip and double-click |
|----------|----------------------------------------------|

1. Download the latest release ZIP (or clone the repo) and keep the `portable/` folder intact.
2. Extract it anywhere—USB drive, Desktop, cloud folder—no admin rights needed.
3. Double-click `index.html` to use the homepage, `exam.html` to jump straight into an exam, or `editor.html` to build content.
4. Import exams by dragging `dump.json`/`.zip` files onto the homepage or copying folders into `user-content/exams/`.

> Want richer metadata or guaranteed image paths later? Just open a terminal in the same folder and run `python server.py`. You can hop between zero-install and server mode anytime.

### Mode 1: With Server (Recommended)

**Best for:** Full features, automatic exam detection, image support

```bash
python server.py
```

**What you get:**
- ✅ Auto-detects exams in `user-content/exams/`
- ✅ Beautiful exam cards with full metadata
- ✅ Images load perfectly
- ✅ Drag & drop imports work
- ✅ All features enabled
- ✅ Dark mode works everywhere
- ✅ Progress tracking across all exams

---

### Mode 2: Direct File (Simple)

**Best for:** Quick access, no installation needed

1. Double-click `index.html`
2. Drag `dump.json` files to import exams
3. Start practicing

**Limitations:**
- ⚠️ Must import exams manually (drag & drop)
- ⚠️ Images may not load properly
- ⚠️ Generic exam cards

---

## 📋 What's Included

### Pages

| File | Purpose | URL |
|------|---------|-----|
| `index.html` | Homepage (exam selection, progress dashboard) | `/` |
| `exam.html` | Exam simulator | `/exam.html?exam=<examId>` |
| `editor.html` | Question editor | `/editor.html` |

### Example Usage

```bash
# Direct exam access (replace <examId> with your exam code)
http://localhost:8000/exam.html?exam=myexam
http://localhost:8000/exam.html?exam=certification

# Editor
http://localhost:8000/editor.html
```

---

## 📦 Importing Exams

![Importing Exams](importing_and_editing.gif)

### Automatic (Server Mode)

Place exam folders in `user-content/exams/`:

```
user-content/exams/
├── example-exam/
│   ├── dump.json         ← Questions
│   ├── metadata.json     ← Exam info (optional)
│   └── images/           ← Images (optional)
└── my-exam/
    └── (same structure)
```

Refresh the page → Exams appear automatically!

---

### Manual (Drag & Drop)

1. Open simulator in browser
2. Drag `dump.json` file onto the homepage
3. Exam imported to localStorage
4. Card appears immediately

Dropping a `.zip` exam pack works too—the simulator reads `dump.json`/`metadata.json` automatically and lets you know if you need to copy bundled images into `user-content/exams/<examId>/images/`.

---

## 🎮 Using the Simulator

### Starting an Exam

1. **Select exam** - Click exam card on homepage
2. **Start** - Click "Start Exam" button (or exam card opens exam.html directly)
3. **Answer questions** - Select your answers
4. **Navigate** - Use Next/Previous buttons
5. **Finish** - Complete all questions or click "Finish Exam"

### During Exam

- **Timer** - Top-right corner (counts down)
- **Progress** - Top bar shows completion percentage
- **Question Counter** - Shows current question / total questions
- **Mark for Review** - Flag difficult questions with yellow badge
- **Show Answer** - Reveal correct answer + detailed explanation
- **Navigation** - Previous/Next buttons (Previous disabled on Q1)
- **Compact UI** - Optimized spacing for comfortable reading

---

## 📊 Viewing Results

After completing an exam:

- **Pass/Fail Status** - Clear visual indicator
- **Score Percentage** - Your final score vs. pass threshold
- **Detailed Review** - See ALL questions with:
  - Your answer
  - Correct answer
  - Status (Correct/Incorrect/Skipped)
- **Performance Stats** - Correct/incorrect breakdown
- **Time Tracking** - Total time taken
- **Retake Option** - Try again with randomized questions

---

## 📈 Progress Tracking

### Homepage Dashboard

The "Your Progress" section shows:
- **Total Attempts** - All attempts across all exams
- **Best Score** - Highest score achieved anywhere
- **Pass Rate** - Overall pass percentage

### Detailed Statistics

Click "View Detailed Stats" to see:
- Per-exam breakdown
- Attempt history with dates and scores
- Performance trends (📈 improving, 📉 declining, ➖ stable)
- Pass rates for each exam

### Export Progress

Click "Export Progress" to download:
- All exam history as JSON
- Can be imported later or shared

---

## 📝 Creating Questions

![Creating Questions](creating_exam.gif)

### Using the Editor

1. **Open editor** - `http://localhost:8000/editor.html`
2. **Select exam** - Choose existing or create new
3. **Add questions** - Click "Add Question"
4. **Fill details** - Question text, options, correct answer, explanation
5. **Add images** - Reference image files for questions/explanations
6. **Save** - Questions saved to localStorage automatically
7. **Export** - Download as JSON to share

### Supported Question Types

- **STANDARD** - Single choice (A, B, C, D)
- **MULTI** - Multiple choice (select many)
- **SEQUENCE** - Ordering (drag or use arrows to arrange)
- **DRAG_DROP_SELECT** - Select N items from available options
- **YES_NO_MATRIX** - Yes/No for each statement

---

## 🎨 Themes

### Full Dark Mode Support

The simulator now includes comprehensive dark/light mode:

**Toggle theme:**
- Click moon/sun icon in top-right corner (any page)
- Preference saved automatically to localStorage

**Features:**
- High contrast in dark mode for readability
- All pages supported (homepage, exam, results, editor)
- Interactive Features cards: Dark backgrounds with light text
- Progress cards: Proper contrast and visibility
- Smooth transitions between modes

---

## 🔧 Customization

### Managing Exams

**Hide/show exams:**
1. Click "Manage Exams" button on homepage
2. Check/uncheck exams to activate/deactivate
3. Hidden exams stay in your folder but don't appear on homepage
4. Settings saved to localStorage

**Quick hide:** Hover over exam card → Click eye-slash icon

### Exam Settings (metadata.json)

```json
{
  "id": "myexam",
  "name": "My Exam",
  "fullName": "My Custom Exam",
  "duration": 45,
  "questionCount": 45,
  "totalQuestions": 137,
  "passScore": 75,
  "badge": "Fundamentals",
  "icon": "fas fa-brain",
  "modules": [
    {
      "icon": "fas fa-brain",
      "name": "AI Workloads & Services"
    }
  ],
  "hasImages": true
}
```

If no metadata file, simulator auto-generates basic settings.

---

## 🐛 Common Issues

### "No exams found"
- **Fix:** Add exams to `user-content/exams/` folder
- **Or:** Import via drag & drop

### Images not loading
- **Fix:** Use server mode (`python server.py`)
- **Not:** `file://` protocol (double-click)

### Dark mode not working
- **Fix:** Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- **Clear cache** if issue persists
- **Verify:** `.dark-mode` class should be on `<body>` element

### Progress cards show no data
- **Fix:** Complete at least one exam to generate progress
- **Note:** Data is stored per-exam in localStorage

### Exam shows "DUMP" name
- **Fix:** Add `metadata.json` to exam folder
- **Or:** Accept generic name for testing

### Save not working in editor
- **Fix:** Check browser localStorage is enabled
- **Backup:** Export questions as JSON regularly

### Giant empty space in exam view
- **Fixed:** This was a CSS issue with `min-height` - should be resolved in v2.0

---

## 📊 Data Storage

Everything stored in browser localStorage:

```javascript
// Questions (per exam)
localStorage['custom_<examId>_questions']  // e.g., custom_myexam_questions

// Metadata (per exam)
localStorage['exam_metadata_<examId>']     // e.g., exam_metadata_myexam

// Progress (per exam)
localStorage['<examId>_progress']          // e.g., myexam_progress

// Settings
localStorage['exam_activation_config']

// Theme preference
localStorage['theme']
```

**Clear data:** Browser DevTools → Application → Local Storage → Clear

**Backup data:** Use "Export Progress" and export questions from editor

---

## 🚀 Next Steps

### For Students
- Import exam packs from teachers or online sources
- Start practicing with timed exams
- Track your progress over multiple attempts
- Review wrong answers with detailed explanations
- Use "Mark for Review" for difficult questions

### For Educators
- Open editor to create custom exams
- Add questions with explanations and images
- Configure exam metadata (duration, pass score, etc.)
- Export as JSON to share with students
- No need for external services - fully offline

### For Developers
- Read [README.md](./README.md) for full documentation
- Check [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute
- See [HOW-TO-DISTRIBUTE.md](./HOW-TO-DISTRIBUTE.md) for distribution
- Use `generate-exam-data-js.py` to convert dumps to JS format

---

## 📚 More Resources

- **README.md** - Full documentation with all features
- **HOW-TO-DISTRIBUTE.md** - Distribution guide
- **CONTRIBUTING.md** - How to contribute
- **user-content/README-IMPORT.md** - Detailed import instructions
- **docs/** - Technical documentation

---

## ⚙️ Alternative Servers

Don't have Python? Use these alternatives:

### Node.js
```bash
npx http-server -p 8000
```

### PHP
```bash
php -S localhost:8000
```

### Ruby
```bash
ruby -run -ehttpd . -p8000
```

### Python 2
```bash
python -m SimpleHTTPServer 8000
```

---

## ✨ New in Version 2.0

- ✅ **Compact UI** - Optimized spacing throughout
- ✅ **Full Dark Mode** - Works on all pages with proper contrast
- ✅ **Global Progress** - View stats across all exams
- ✅ **Detailed Review** - See all questions with answers in results
- ✅ **Enhanced Readability** - Better font sizes and spacing
- ✅ **Bug Fixes** - Fixed dark mode, progress cards, spacing issues

---

**That's it! You're ready to start practicing. Good luck! 🎓**
