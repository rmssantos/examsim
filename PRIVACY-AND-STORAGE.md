# Privacy & Data Storage

## 🔒 Critical Information: Your Data Stays Local

### TL;DR
**ALL user data is stored ONLY in the user's browser `localStorage`. Nothing is sent to the server. Each user's data is completely isolated and private.**

> ⚠️ **Content policy:** The public repo never ships proprietary exam dumps (AI-900, AI-102, etc.). Keep those packs in private storage and only copy them locally when you need them.

---

## How It Works

### Server Role
The server ONLY serves static files:
- HTML pages (index.html, exam.html, editor.html)
- CSS stylesheets
- JavaScript files
- Images (if placed in `user-content/exams/*/images/`)

**The server does NOT:**
- ❌ Store user data
- ❌ Receive uploaded dumps
- ❌ Track users
- ❌ Share data between users
- ❌ Send any data anywhere

---

## Multi-User Scenario

### Scenario: Empty Server

```
Server (completely empty, no dumps)
├── index.html
├── exam.html
├── *.js
├── *.css
└── user-content/exams/ (empty folder)
```

### User A Connects

1. Opens `http://your-server:8000`
2. Sees "No exams found" message
3. Drags `ai900-dump.json` onto the page
4. **Dump is saved to User A's browser `localStorage`**
5. User A sees the AI-900 exam card
6. Can take exams, track progress, etc.

**Where is the data?**
- ✅ User A's browser → `localStorage['custom_ai900_questions']`
- ❌ NOT on the server
- ❌ NOT in any database
- ❌ NOT accessible to anyone else

### User B Connects (Same Server)

1. Opens `http://your-server:8000` (same URL as User A)
2. Sees "No exams found" message (empty!)
3. **Cannot see User A's imported dumps**
4. Must import their own dumps separately
5. Their data is also stored locally in their browser

**Result:**
- User A has AI-900 in their browser
- User B sees nothing (empty server)
- **Complete isolation between users**

---

## Data Storage Locations

### Client-Side (Browser localStorage)

All data is stored in the user's browser:

```javascript
// Questions
localStorage['custom_ai900_questions']  // User's imported questions
localStorage['custom_ai102_questions']

// Metadata
localStorage['exam_metadata_ai900']     // Exam configuration
localStorage['exam_metadata_ai102']

// Progress
localStorage['ai900_progress']          // User's exam history
localStorage['ai102_progress']

// Settings
localStorage['exam_activation_config']  // Which exams are visible
localStorage['theme']                   // Dark/light mode preference
```

**Location on disk:**
- **Chrome/Edge**: `%LocalAppData%\Google\Chrome\User Data\Default\Local Storage\`
- **Firefox**: `%AppData%\Mozilla\Firefox\Profiles\*.default\storage\default\`
- **Safari**: `~/Library/Safari/LocalStorage/`

### Server-Side (Optional Pre-Installed Exams)

The ONLY way to share exams with all users is to **pre-install** them on the server (inside a private, access-controlled deployment):

```
user-content/exams/
├── ai900/              ← Example private exam ID
│   ├── dump.json         ← This will be visible to ALL users
│   ├── metadata.json
│   └── images/
└── ai102/
    └── ...
```

**When server mode detects these folders:**
- ALL users see these exams automatically
- No import needed
- Exams are served as static files (read-only)
- Each user's progress is still stored locally in their browser

---

## Privacy Implications

### ✅ What IS Private

1. **User-imported exams** - Only visible to the user who imported them
2. **Progress data** - Stored locally, never sent to server
3. **Editor-created questions** - Saved in user's localStorage
4. **Theme preferences** - Local to each browser
5. **Exam activation settings** - Local to each user

### ⚠️ What is NOT Private (if pre-installed on server)

1. **Server-side exam folders** in `user-content/exams/`
   - Visible to ALL users
   - Anyone with server access can read the files
   - Questions are served as static files

---

## Use Cases

### Case 1: Shared Learning Platform

**Scenario:** Teacher wants students to practice together

**Setup:**
```bash
# Teacher installs exams on server
user-content/exams/
├── ai900/
│   ├── dump.json    ← All students see this
│   └── metadata.json
```

**Result:**
- ✅ All students see AI-900 exam
- ✅ Each student's progress is private (localStorage)
- ✅ No data sharing between students
- ✅ Teacher cannot see individual progress

### Case 2: Personal Study (Most Secure)

**Scenario:** User wants complete privacy

**Setup:**
- Empty server (no pre-installed exams)
- User imports dumps via drag & drop

**Result:**
- ✅ All data in user's browser only
- ✅ Server has zero knowledge of exams
- ✅ No one else can access the data
- ✅ Even server admin cannot see user data

### Case 3: Organization Exam Platform

**Scenario:** Company deploys exam simulator for certification prep

**Setup:**
```bash
# Admin pre-installs official exams
user-content/exams/
├── azure-fundamentals/
├── azure-admin/
└── azure-developer/
```

**Result:**
- ✅ All employees see the same exams
- ✅ Each employee's progress is private
- ✅ No central tracking or monitoring
- ✅ Fully offline capable

---

## Security Considerations

### What the Server Admin Can See

**With server access, admin can:**
- ✅ Read pre-installed exam files in `user-content/exams/`
- ✅ See which exams are available on the server
- ✅ Access server logs (HTTP requests)

**Admin CANNOT see:**
- ❌ User-imported dumps (stored in browser localStorage)
- ❌ User progress or scores
- ❌ User answers or attempt history
- ❌ Which users imported what
- ❌ User theme preferences

### What Other Users Can See

**Users can:**
- ✅ See pre-installed exams on the server

**Users CANNOT see:**
- ❌ Other users' imported dumps
- ❌ Other users' progress
- ❌ Other users' localStorage data
- ❌ Anything from other users' browsers

---

## Technical Details

### How localStorage Works

```javascript
// When user imports a dump via drag & drop
async importJsonFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    let examId = file.name.replace(/\.(json|zip)$/i, '');

    // Store in localStorage (client-side ONLY)
    await window.examManager.importExam(examId, data);

    // This creates:
    // localStorage['custom_' + examId + '_questions'] = JSON.stringify(data.questions)
    // localStorage['exam_metadata_' + examId] = JSON.stringify(data.metadata)
}
```

**Key points:**
1. Data never leaves the browser
2. No HTTP POST to server
3. No network requests for user data
4. Everything stays in browser memory/localStorage

### Network Traffic Analysis

**When user imports a dump:**
```
Browser → [LOCAL OPERATION] → localStorage
```

**NO network traffic to server!**

**When user takes an exam:**
```
Browser → Reads from localStorage → Displays questions
Browser → Saves progress → localStorage
```

**NO network traffic to server!**

**Only network requests:**
- GET `index.html` (initial page load)
- GET `exam.html` (when starting exam)
- GET `*.js`, `*.css` (static assets)
- GET `images/*.jpg` (if exam has images)

**All static files, no user data transmitted!**

---

## Comparison with Other Platforms

### Traditional Exam Platforms

```
User → Server → Database
     ↓
  Server knows everything:
  - Who took which exam
  - Scores and progress
  - Time spent
  - Wrong answers
```

### This Simulator

```
User → Browser localStorage
     ↓
  Server knows nothing:
  - No user tracking
  - No progress monitoring
  - No centralized data
  - Complete privacy
```

---

## FAQ

### Q: Can the server admin see my progress?
**A:** No. Progress is stored in your browser's localStorage only.

### Q: If I import a dump, can other users see it?
**A:** No. Your imported dumps are private to your browser.

### Q: How do I share an exam with others?
**A:** Export as JSON from editor, send file, others import via drag & drop. Or pre-install on server.

### Q: What if I clear my browser data?
**A:** All your imported exams and progress will be lost. Export progress before clearing.

### Q: Can I use this on multiple computers?
**A:** Yes, but data doesn't sync. Import dumps separately on each computer.

### Q: Is my data backed up?
**A:** No. Use "Export Progress" to backup your progress data manually.

### Q: Can teacher see student progress?
**A:** No, unless students manually export and share their progress JSON files.

### Q: What about GDPR/privacy laws?
**A:** Since no data is sent to servers, there are no GDPR concerns. All data is local.

### Q: Can I self-host this privately?
**A:** Yes! Run on your own server. No external services needed.

### Q: Does this work offline?
**A:** Yes, after initial load. All functionality works without internet.

---

## Verification Steps

### Prove It Yourself

1. **Open browser DevTools (F12)**
2. **Go to Application tab**
3. **Select Local Storage**
4. **Import a dump**
5. **Watch localStorage populate in real-time**
6. **Check Network tab** - No POST requests for user data!

### Network Monitoring

```bash
# Monitor network traffic while using the app
# You'll see ONLY:
GET /index.html
GET /exam.html
GET /script-multi-exam.js
GET /style-new.css
GET /images/question1.jpg

# You will NOT see:
POST /api/save-progress  ← Doesn't exist!
POST /api/upload-dump    ← Doesn't exist!
PUT /api/user-data       ← Doesn't exist!
```

**There are NO API endpoints to receive user data!**

---

## Conclusion

This exam simulator is designed with **privacy-by-default**:

- ✅ **100% client-side** data storage
- ✅ **No tracking or telemetry**
- ✅ **No user database**
- ✅ **No data collection**
- ✅ **Complete isolation** between users
- ✅ **Fully offline** after initial load
- ✅ **No cookies** or tracking scripts
- ✅ **Open source** - verify the code yourself

**Your data is YOUR data. It stays in YOUR browser.**

---

## For System Administrators

If you're deploying this for multiple users:

### To Share Exams With Everyone
Place exams in `user-content/exams/` on the server

### To Keep User Data Private
Do NOT modify the code to add any:
- Database connections
- API endpoints
- User tracking
- Central storage

The app is intentionally designed with no server-side data storage. Keep it that way!

---

**Questions? See [README.md](./README.md) or [CONTRIBUTING.md](./CONTRIBUTING.md)**
