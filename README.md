# Exam Simulator (Portable)

> **A universal, offline-capable exam practice platform with dynamic question types, visual editor, and comprehensive progress tracking.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/rmssantos/examsim)

---

## ⚠️ Educational Tool Disclaimer

**This exam simulator is provided solely as a study aid and practice tool.**

- ❌ **Not affiliated with** Microsoft, Azure, or any certification authority
- 📚 **Educational purposes only** - for personal study and practice
- ⚡ **Exam content subject to change** - official exams are regularly updated
- ✅ **No guarantees** - this tool does not guarantee exam success
- 📖 **Always refer to official documentation** for authoritative certification information
- ⚖️ **User responsibility** - ensure imported content complies with applicable terms of service

> Use this simulator to practice exam-taking skills, time management, and knowledge retention. Always supplement with official Microsoft Learn paths and documentation.

---

## 🎯 Overview

The **Exam Simulator** is a self-contained, browser-based exam practice platform designed for certification preparation. Teams can unzip it anywhere, create their own exams with the built-in editor, share/import packs, and practice together—no installation, licenses, or external services required. It supports multiple question types (single/multiple choice, drag & drop, sequences, Y/N matrices), includes a visual question editor, and works completely offline with full dark mode support.

### Key Features

- ✅ **100% Offline** - Works without internet (local server or file:// mode)
- ✅ **Portable Zip** - No installers; unzip anywhere and double-click `index.html`
- ✅ **Dynamic Exam Detection** - Automatically discovers exams in `user-content/exams/`
- ✅ **Visual Question Editor** - Create and edit questions with a built-in editor
- ✅ **5+ Question Types** - Standard, multi-select, drag & drop, sequences, Y/N matrices
- ✅ **Progress Tracking** - Complete exam history with analytics and detailed review
- ✅ **Dark/Light Mode** - Full theme toggle with preference saving across all pages
- ✅ **Image Support** - Full integration for question and explanation images
- ✅ **Timed Exams** - Configurable timer with visual countdown
- ✅ **Compact Modern UI** - Optimized spacing and enhanced readability
- ✅ **Global Progress Dashboard** - View stats across all exams


## 🚀 Quick Start

![Creating an Exam](creating_exam.gif)

### Option 0: Portable Zip (Zero Install)

The simulator ships as a self-contained folder. Share it as a `.zip`, unzip anywhere (USB drive, OneDrive, Downloads), then double-click `index.html` to start practicing—no runtimes, package managers, or admin rights required.

**Steps:**
1. Download or clone the repo, or grab the latest GitHub Release ZIP.
2. Extract the `portable/` directory (keep its structure intact).
3. Double-click `portable/index.html` for the homepage, `exam.html` for a specific exam, or `editor.html` to create content.
4. Use drag & drop to import exams, or copy folders into `user-content/exams/`.

> Tip: You can still launch `python server.py` later if you want auto-detection + perfect image paths, but it’s optional.

### Option 1: With Local Server (Recommended)

The local server enables full functionality including automatic exam detection and image loading.

```bash
# Navigate to the portable folder
cd path/to/portable

# Start the server (Python)
python server.py

# Or use Node.js
npx http-server -p 8000
```

The server will automatically:
- Start on `http://localhost:8000`
- Open your browser
- Detect exams in `user-content/exams/`
- Enable drag & drop imports

**Stop the server:** Press `Ctrl+C`

---

### Option 2: Direct File Opening (Limited)

For quick access without a server (some features may be limited):

1. Navigate to the `portable` folder
2. Double-click `index.html`
3. Manually import exams via drag & drop

**Limitations:**
- Cannot auto-detect exams in folders (browser security)
- Images may not load properly
- Must import exams manually

---

## 📁 Project Structure

```
portable/
├── index.html              # Main homepage (exam selection)
├── exam.html               # Exam simulator
├── editor.html             # Question editor
├── image-inspector.html    # Image inspection utility
├── server.py               # Local HTTP server
├── exam-manager.js         # Exam detection and management
├── exam-loader.js          # Dynamic exam loading
├── image-loader.js         # Image handling
├── image-storage.js        # Image storage system
├── script-multi-exam.js    # Main exam logic
├── editor.js               # Editor functionality
├── style-new.css           # Core styles
├── exam-enhancements.css   # Compact exam UI styles
├── homepage-styles.css     # Homepage specific styles
├── modern-enhancements.css # Modern UI enhancements
├── multi-exam-styles.css   # Multi-exam support
├── creating_exam.gif       # Demo GIF for documentation
├── importing_and_editing.gif # Demo GIF for documentation
├── generate-exam-data-js.py # Generate exam-data.js from dumps
├── docs/                   # Documentation folder
│   ├── compliance-summary.md
│   ├── Data-and-Dumps.md
│   ├── public-repo-plan.md
│   ├── Troubleshooting.md
│   └── UI-UX.md
├── exam-dumps/             # Custom exam files folder
│   └── README.md
└── user-content/
    ├── README-IMPORT.md    # Import instructions
    ├── imports/            # Temporary import staging area
    └── exams/              # User exam content (empty by default)
        └── .gitkeep
```

---

## 📋 Usage Modes

### Mode Comparison

| Feature | Without Server (`file://`) | With Server (`localhost`) |
|---------|---------------------------|---------------------------|
| **Auto-detection** | ❌ No | ✅ Yes |
| **Drag & drop import** | ✅ Yes | ✅ Yes |
| **Full metadata** | ⚠️ Generic | ✅ Complete |
| **Images** | ⚠️ May fail | ✅ Always works |
| **Beautiful cards** | ⚠️ Generic | ✅ Customized |
| **Setup** | None | Python/Node required |

### Recommendation

- **Use Server Mode** if you want automatic exam detection and full features
- **Use File Mode** if you only need one exam and prefer maximum simplicity

---

## 📦 Importing Exams

![Importing and Editing Exams](importing_and_editing.gif)

### Method 1: Automatic Detection (Server Mode Only)

1. Place exam folders in `user-content/exams/`
2. Each folder should contain:
   - `dump.json` (required) - Question data
   - `metadata.json` (optional) - Exam information
   - `images/` (optional) - Image assets
3. Start the server
4. Exams appear automatically on the homepage

**Example structure (imported from your private exam pack):**
```
user-content/exams/<exam-id>/
├── dump.json
├── metadata.json
└── images/
  ├── question1.jpg
  └── diagram2.png
```

---

### Method 2: Drag & Drop Import (Both Modes)

1. Open the simulator in your browser
2. Drag a `dump.json` file anywhere on the homepage
3. The exam is imported and stored in `localStorage`
4. A card appears immediately (may show generic metadata)

You can also drop `.zip` exam packs. The simulator will read `dump.json`/`metadata.json` automatically and remind you to copy any bundled images into `user-content/exams/<examId>/images/`.

---

## 📝 Creating Custom Exams

### Using the Built-in Editor

1. Open `editor.html` in your browser
2. Create or select an exam
3. Add questions with the visual editor:
   - Single/multiple choice
   - Drag & drop
   - Sequence ordering
   - Y/N matrices
4. Add images, explanations, and metadata
5. Save (auto-syncs to `localStorage` and `window.userExams`)
6. Export as JSON to share

### Question Types Supported

| Type | Description | Use Case |
|------|-------------|----------|
| **STANDARD** | Single choice | Traditional multiple choice (1 answer) |
| **MULTI** | Multiple choice | Select multiple correct answers |
| **SEQUENCE** | Ordering | Arrange items in correct order |
| **DRAG_DROP_SELECT** | Drag & drop | Select N items from a list |
| **YES_NO_MATRIX** | Matrix | Answer Yes/No for each statement |

---

## 🎨 Features

### Exam Features
- **Timed Sessions** - 45-60 minute configurable timer
- **Question Counter** - Real-time progress tracking
- **Mark for Review** - Flag difficult questions
- **Show Answer** - Reveal correct answers with explanations
- **Image Support** - Display images in questions and explanations
- **Navigation** - Previous/Next buttons for easy navigation
- **Compact UI** - Optimized spacing for better readability
- **Question Type Indicators** - Visual badges for special question types

### Results Features
- **Pass/Fail Status** - Based on configurable pass score (70-75%)
- **Performance Analytics** - Correct/incorrect breakdown
- **Detailed Review** - See all questions with your answers vs. correct answers
- **Time Tracking** - Total time taken vs. available time
- **Progress Bars** - Visual representation of performance
- **Exam History** - Complete history of all attempts with trends

### Progress Tracking
- **Global Dashboard** - View stats across all exams on homepage
- **Total Attempts** - Aggregated count from all exams
- **Best Score** - Highest score achieved across all attempts
- **Pass Rate** - Overall pass percentage
- **Detailed Statistics** - Per-exam breakdowns with trends
- **Export Progress** - Download all progress data as JSON

### Editor Features
- **Visual Editing** - WYSIWYG question editor
- **Live Preview** - See questions as they'll appear
- **Import/Export** - JSON import/export for sharing
- **Image Upload** - Reference images in questions
- **Metadata Editor** - Configure exam settings
- **Save States** - Auto-save to localStorage

---

## 🎨 Themes

The simulator includes a comprehensive dark/light mode system:
- Click the moon/sun icon in any screen
- Preference saved to `localStorage`
- Smooth animated transitions
- Accessible color contrast on all pages
- Full support across homepage, exam, results, and editor
- Optimized for readability in both modes

**Dark Mode Features:**
- High contrast text on dark backgrounds
- Enhanced visibility for Interactive Features cards
- Proper contrast for Progress cards
- Consistent theming across all components

---

## 🔧 Configuration

### Exam Activation/Deactivation

Control which exams appear on the homepage:

1. Click **"Manage Exams"** on the homepage
2. Toggle checkboxes to activate/deactivate exams
3. Deactivated exams remain in your folder but are hidden
4. Settings saved to `localStorage`

**Quick hide:** Hover over any exam card → Click the eye-slash icon

---

## 📊 Data Storage

### Dual Storage Strategy

Questions are stored in two locations for reliability:

1. **localStorage** - `custom_${examId}_questions`
   - Persistent across browser sessions
   - Survives page refreshes
   - Limited to ~5-10MB per origin

2. **window.userExams** - In-memory object
   - Available immediately without reload
   - Used for live exam sessions
   - Cleared on page refresh (reloaded from localStorage)

### Storage Keys

```javascript
const examId = 'your-exam-id';

// Questions & metadata
localStorage[`custom_${examId}_questions`];
localStorage[`exam_metadata_${examId}`];

// Progress tracking (per exam)
localStorage[`${examId}_progress`];

// Global settings
localStorage['exam_activation_config'];
localStorage['theme'];
```

> Example IDs such as `ai900` or `ai102` are commonly used internally but the actual dumps are **not** shipped in this repo—store them privately and import them at runtime.

---

## 🔍 Troubleshooting

### "No exams found" (Server Mode)

**Causes:**
- Exam folders missing from `user-content/exams/`
- Missing `dump.json` files
- Server not running

**Solutions:**
1. Check that `user-content/exams/` contains exam folders
2. Verify each folder has `dump.json`
3. Restart the server
4. Check browser console (F12) for errors

---

### Images Not Loading

**Causes:**
- Using `file://` protocol instead of server
- Incorrect image paths in `dump.json`
- Missing image files

**Solutions:**
1. **Use server mode** (`python server.py`)
2. Verify image paths are relative to `images/` folder
3. Check filenames match exactly (case-sensitive)
4. Ensure images exist in `user-content/exams/{exam-id}/images/`

> The public repo keeps `images/` empty on purpose. Copy your private exam media into `user-content/exams/<exam-id>/images/` (or host them elsewhere) when running the simulator locally.

---

### Dark Mode Not Working

**Causes:**
- Browser cache showing old CSS
- Theme preference not saved

**Solutions:**
1. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. Clear browser cache
3. Check if theme icon toggles (moon/sun)
4. Inspect element to verify `.dark-mode` class is on `<body>`

---

### Progress Cards Show No Data

**Causes:**
- No exam attempts completed yet
- localStorage cleared

**Solutions:**
1. Complete at least one exam to generate progress data
2. Check if other progress features work (View Detailed Stats)
3. Progress is stored per-exam with `${examId}_progress` key

---

### Card Shows Generic Name Instead of Exam Name

**Cause:** Manual drag & drop import without metadata

**Solutions:**
1. Add `metadata.json` to the exam folder
2. Use server mode for auto-generated metadata
3. Or accept generic metadata for quick testing

---

### Save Not Persisting in Editor

**Causes:**
- Browser localStorage disabled
- Storage quota exceeded

**Solutions:**
1. Check browser settings (allow localStorage)
2. Clear old exam data to free space
3. Export questions as JSON backup
4. Reload page and try again

---

## 🌐 Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| **Chrome** | 80+ | ✅ Full |
| **Firefox** | 75+ | ✅ Full |
| **Edge** | 80+ | ✅ Full |
| **Safari** | 13+ | ✅ Full |
| **Opera** | 67+ | ✅ Full |

**Requirements:**
- JavaScript enabled
- LocalStorage enabled
- ES6 support

---

## 📜 Exam Data Format

### dump.json Structure

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
  }
]
```

### metadata.json Structure (Optional)

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

---

## 🚢 Distribution

### For End Users

**Option A: Simulator Only (Recommended)**
1. Download the portable folder (without exam content)
2. Users import their own exam packs separately
3. Keeps distribution lightweight and flexible

**Option B: All-in-One Bundle**
1. Include simulator + pre-installed exam packs
2. Larger download but ready to use immediately

### Creating Exam Packages

```bash
# Structure for distribution
exam-pack/
├── dump.json
├── metadata.json
└── images/
    └── (image files)

# Package as ZIP
zip -r ai900-exam-pack.zip dump.json metadata.json images/
```

**See [HOW-TO-DISTRIBUTE.md](./HOW-TO-DISTRIBUTE.md) for detailed distribution guide.**

### Share with Your Team (GitHub-Ready)

1. **Push or fork this repo** to your organization’s GitHub project (it’s already portable).
2. **Create a Release ZIP** (GitHub → Releases → “Draft new release” → Upload `portable.zip`).
3. **Tell teammates to download & unzip** the release, then double-click `index.html`—no installs needed.
4. **Provide exam packs** as separate ZIPs or folders they can drag/drop or copy into `user-content/exams/`.
5. **Encourage creators** to use `editor.html` to build new exams, export them, and commit/attach them for the rest of the team.

Add a short `README-team.md` (or reuse this README) in your repo describing:
- Where to download the latest portable zip
- How to import/share exams internally
- Who owns official exam packs vs. personal practice sets

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Issues
- Use GitHub Issues
- Include browser version and OS
- Provide console logs (F12 → Console)
- Describe steps to reproduce

### Submitting Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup
```bash
# Clone the repo
git clone https://github.com/yourusername/exam-simulator.git
cd exam-simulator/portable

# Start development server
python server.py

# Make changes, test locally
# Submit PR when ready
```

---

## 📚 Documentation

- **README.md** (this file) - Main documentation
- **QUICKSTART.md** - Quick start guide
- **HOW-TO-DISTRIBUTE.md** - Distribution guide
- **user-content/README-IMPORT.md** - Import instructions
- **docs/** - Additional technical documentation

---

## 🎓 Use Cases

### For Students
- Practice certification exams offline
- Track progress over multiple attempts
- Focus on weak areas with detailed review
- Create custom practice exams

### For Educators
- Create custom exams for your courses
- Share exam packs with students
- No need for external services or subscriptions
- Fully offline and private

### For Trainers
- Develop exam prep materials
- Test candidate knowledge
- Track learner progress
- Export/import questions easily

---

## 🔒 Privacy

- **100% Client-Side** - No data sent to servers
- **Local Storage Only** - All data stays in your browser
- **No Analytics** - No tracking or telemetry
- **Offline Capable** - Works without internet

---

## ⚖️ Legal & Ethics

**IMPORTANT:**
- This simulator is an **educational tool**
- Users are responsible for content they import
- Ensure you have rights to use exam materials
- Respect intellectual property laws
- Do not distribute copyrighted exam content without permission

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with vanilla JavaScript (no frameworks)
- Icons from [Font Awesome](https://fontawesome.com)
- Inspired by modern exam platforms
- Community contributions welcome

---

## 📞 Support

For issues, questions, or feature requests:
- Open an issue on [GitHub](https://github.com/rmssantos/examsim/issues)
- Check the [Troubleshooting](#-troubleshooting) section
- Review documentation in `docs/` folder

---

## 🗺️ Roadmap

### Version 2.0 - Completed ✅
- Multi-exam support
- Dynamic exam detection
- Visual question editor
- Comprehensive progress tracking with global dashboard
- Full dark/light mode across all pages
- Compact UI with enhanced readability
- Detailed question review in results
- 5+ question types

### Version 2.1 - Planned 🔜
- Question analytics and insights
- Performance trends over time
- Mobile responsive improvements
- Accessibility enhancements (WCAG 2.1 AA)
- More question types (hotspot, case studies)
- PDF export for results
- Advanced search and filtering

### Future Enhancements 💡
- Multi-language support
- Collaborative exam creation
- Question difficulty ratings
- Study mode with spaced repetition
- API for external integrations

---

## 📋 Recent Updates (v2.0)

### UI/UX Improvements
- ✅ Compact spacing throughout the application
- ✅ Enhanced readability with optimized font sizes
- ✅ Fixed dark mode contrast issues
- ✅ Improved Interactive Features cards visibility
- ✅ Better Progress cards with global stats

### Progress Tracking
- ✅ Global progress dashboard on homepage
- ✅ Detailed review showing all questions with answers
- ✅ Per-exam statistics with trends
- ✅ Export progress data functionality
- ✅ Pass rate calculations

### Bug Fixes
- ✅ Fixed dark mode not applying to homepage elements
- ✅ Fixed Progress cards not showing data
- ✅ Fixed giant empty space before answer feedback
- ✅ Fixed results screen missing colors
- ✅ Cleaned up temporary files

---

**Happy studying! 🎓**