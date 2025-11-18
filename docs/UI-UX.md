# UI and UX Guidelines

## Answer Highlighting

### Reveal Answer Behavior

When the user clicks "Show Answer":

**Correct Answer:**
- ✅ Entire option card turns **green**
- White text on green background
- High contrast maintained in both light and dark modes

**Incorrect Answer (if selected):**
- ❌ Entire option card turns **red**
- White text on red background
- User's incorrect selection clearly indicated

**Visual Example:**
```
┌─────────────────────────────────────┐
│ A. Correct Answer                   │  ← Green background
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ B. Your Incorrect Answer            │  ← Red background
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ C. Other Option                      │  ← Neutral (unchanged)
└─────────────────────────────────────┘
```

### Color Contrast

**Light Mode:**
- Correct: `#28a745` (green)
- Incorrect: `#dc3545` (red)
- Text: `#ffffff` (white)
- WCAG AA compliant

**Dark Mode:**
- Correct: `#2ea043` (bright green)
- Incorrect: `#f85149` (bright red)
- Text: `#ffffff` (white)
- Enhanced contrast for visibility

---

## Question Navigation

### Navigation Controls

**Previous Button:**
- Disabled on first question (Question 1/45)
- Gray appearance when disabled
- Active appearance on other questions

**Next Button:**
- Always enabled
- Advances to next question
- Changes to "Finish Exam" on last question

**Progress Bar:**
- Top of screen
- Shows completion percentage
- Fills left-to-right as questions are answered
- Color changes: blue → green (near completion)

---

## Question Types UI

### STANDARD (Single Choice)

**Display:**
- Radio buttons (only one selectable)
- Options displayed vertically
- Large clickable areas

**Interaction:**
- Click option or press letter key (A-D)
- Selected option highlighted
- Previous selection automatically deselected

---

### MULTI (Multiple Choice)

**Display:**
- Checkboxes (multiple selectable)
- Options displayed vertically
- Instruction text: "Select ALL that apply"

**Interaction:**
- Click checkbox or press number key
- Multiple selections allowed
- All selected options highlighted

---

### SEQUENCE (Ordering)

**Display:**
- Items in vertical list
- Drag handles on left side
- Up/down arrow buttons on right

**Interaction:**
- Drag items to reorder
- Or use arrow buttons to move up/down
- Visual feedback during drag

---

### DRAG_DROP_SELECT

**Display:**
- Two columns: "Available" and "Selected"
- Instruction: "Select N items from the list"
- Counter shows: "X/N items selected"

**Interaction:**
- Click item to move between columns
- Or drag and drop between columns
- Validation: must select exactly N items

---

### YES_NO_MATRIX

**Display:**
- Table format
- Rows: statements
- Columns: Yes | No
- Radio buttons for each row

**Interaction:**
- Click Yes or No for each statement
- Must answer all statements to proceed
- Visual indicator for unanswered rows

---

## Timer Display

The timer appears in the top-right corner of the exam screen.

### Timer States

**Normal (> 10 minutes remaining):**
- Color: Neutral gray
- Format: `MM:SS`
- No special styling

**Warning (5-10 minutes remaining):**
- Color: Orange/yellow
- Pulsing animation
- Format: `MM:SS`

**Danger (< 5 minutes remaining):**
- Color: Red
- Strong pulsing animation
- Format: `MM:SS`
- More prominent visual indicator

**Expired:**
- Timer shows `00:00`
- Exam auto-finishes
- Results screen displayed

---

## Finish Exam Flow

### Confirmation Dialog

When user clicks "Finish Exam":

**If unanswered questions exist:**
```
┌─────────────────────────────────────────┐
│  ⚠️ Finish Exam?                        │
│                                         │
│  You have X unanswered questions.       │
│                                         │
│  Are you sure you want to finish?      │
│                                         │
│  [Review]  [Finish Exam]                │
└─────────────────────────────────────────┘
```

**If all questions answered:**
```
┌─────────────────────────────────────────┐
│  📝 Finish Exam?                        │
│                                         │
│  All questions answered.                │
│                                         │
│  Submit your exam for scoring?          │
│                                         │
│  [Cancel]  [Submit]                     │
└─────────────────────────────────────────┘
```

---

## Results Screen

### Pass/Fail Indicator

**Pass:**
- ✅ Green background
- Large "PASSED" text
- Score percentage displayed
- Congratulatory message

**Fail:**
- ❌ Red background
- Large "FAILED" text
- Score percentage displayed
- Encouragement to retry

### Score Breakdown

**Performance Card:**
```
┌─────────────────────────────────────────┐
│  Your Score                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━            │
│  38/45 (84%)                            │
│                                         │
│  ✅ Correct: 38                         │
│  ❌ Incorrect: 5                        │
│  ⚪ Skipped: 2                          │
│                                         │
│  Pass Threshold: 75%                    │
└─────────────────────────────────────────┘
```

### Detailed Review Section

Shows all questions with:
- Question number and text preview (first 120 characters)
- Your answer vs. Correct answer
- Status badge: ✅ Correct | ❌ Incorrect | ⚪ Skipped
- Color-coded status

**Visual Layout:**
```
Question 1: What is Azure Cognitive Services? A clo...
Your answer: A. Cloud-based AI service
Correct answer: A. Cloud-based AI service
Status: ✅ Correct

Question 2: Which service provides speech recognition...
Your answer: C. Azure Speech Service
Correct answer: B. Cognitive Services
Status: ❌ Incorrect
```

---

## Homepage (Exam Selection)

### Exam Cards

**Card Layout:**
```
┌─────────────────────────────────────────┐
│  🧠 AI-900                              │
│  Azure AI Fundamentals                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━            │
│  📊 45 questions | ⏱️ 45 min           │
│  🎯 Pass: 75%                           │
│                                         │
│  📚 Modules:                            │
│  • AI Workloads & Services              │
│  • Machine Learning Principles          │
│  • Computer Vision                      │
│                                         │
│  [Start Exam]                           │
└─────────────────────────────────────────┘
```

### Hover Effects

**3D Tilt:**
- Subtle 3D rotation on hover
- Follows mouse position
- Smooth animation

**Glow Effect:**
- Soft glow appears around card
- Matches card gradient color
- Fades in on hover

---

## Progress Dashboard

### Global Progress (Homepage)

```
┌─────────────────────────────────────────┐
│  📈 Your Progress                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━            │
│  Total Attempts: 15                     │
│  Best Score: 92%                        │
│  Pass Rate: 67%                         │
│                                         │
│  [View Detailed Stats] [Export Progress]│
└─────────────────────────────────────────┘
```

### Per-Exam Statistics

Shows for each exam:
- Total attempts
- Average score
- Best score
- Pass rate
- Performance trend: 📈 Improving | 📉 Declining | ➖ Stable
- Recent attempt history

---

## Theme Toggle

### Toggle Button

**Location:** Top-right corner of all pages

**Light Mode Button:**
- Icon: 🌙 Moon
- Tooltip: "Switch to dark mode"

**Dark Mode Button:**
- Icon: ☀️ Sun
- Tooltip: "Switch to light mode"

### Theme Persistence

- Preference saved to `localStorage['theme']`
- Persists across sessions
- Applies to all pages (homepage, exam, editor, results)

---

## Accessibility Features

### Focus Indicators

**Buttons and Links:**
- Blue outline on focus
- 2px width
- High contrast

**Answer Options:**
- Border changes on focus
- Color: Primary blue
- 3px width

### Large Clickable Areas

**Answer Options:**
- Full card is clickable
- Minimum height: 48px
- Padding: 12px

**Navigation Buttons:**
- Minimum size: 44x44px
- Clear spacing between buttons

### Screen Reader Support

**ARIA Labels:**
- Navigation buttons labeled
- Answer options labeled with letters
- Progress indicators announced
- Timer status announced

---

## Editor UI

### Two-Column Layout

**Left Column (60%):**
- Question list (top)
- Question form (bottom)
- Scrollable independently

**Right Column (40%):**
- Live preview
- Shows question as it will appear in exam
- Updates in real-time

### Toolbar

**Sticky at top:**
```
[New] [Load] [Save] [Import] [Export] [Shuffle] [Validate]
```

**Actions:**
- New: Create new question
- Load: Load exam from localStorage or file
- Save: Save to localStorage
- Import: Import JSON file
- Export: Download as JSON
- Shuffle: Randomize question order
- Validate: Check for errors

---

## Responsive Design

### Breakpoints

**Desktop (> 1024px):**
- Full two-column layout
- Large exam cards (3 per row)
- Expanded navigation

**Tablet (768px - 1024px):**
- Condensed layout
- Medium exam cards (2 per row)
- Compact navigation

**Mobile (< 768px):**
- Single column
- Full-width exam cards (1 per row)
- Bottom navigation
- Hamburger menu

---

## Animation and Transitions

### Smooth Transitions

**All interactive elements:**
```css
transition: all 0.3s ease;
```

**Hover effects:**
- Transform: 300ms ease
- Box-shadow: 200ms ease
- Background: 200ms ease

### Loading States

**Exam Loading:**
- Spinner animation
- "Loading questions..." text
- Fade-in when ready

**Image Loading:**
- Placeholder shown
- Fade-in when loaded
- Error message if failed

---

## Error States

### No Exams Found

```
┌─────────────────────────────────────────┐
│  📂 No Exams Available                  │
│                                         │
│  Import exams via drag & drop           │
│  or place them in user-content/exams/   │
│                                         │
│  [Open Editor]                          │
└─────────────────────────────────────────┘
```

### Image Load Failed

```
┌─────────────────────────────────────────┐
│  🖼️ [Image unavailable]                 │
│  diagram1.jpg                           │
└─────────────────────────────────────────┘
```

### Validation Errors

```
⚠️ Validation Failed
• Question 5: Missing correct answer
• Question 12: Invalid image reference
• Question 23: Duplicate ID
```

---

## Best Practices

### UI Consistency
- Use consistent spacing (8px grid)
- Maintain color palette across all screens
- Use established patterns for similar actions

### Performance
- Lazy load images
- Minimize animations on low-end devices
- Optimize for 60fps interactions

### User Feedback
- Immediate visual feedback for all actions
- Clear error messages
- Loading indicators for async operations

---

## See Also

- [README.md](../README.md) - Main documentation
- [QUICKSTART.md](../QUICKSTART.md) - Quick start guide
- [Data-and-Dumps.md](./Data-and-Dumps.md) - Question data formats
