# Contributing to Azure AI Exam Simulator

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

---

## 🤝 Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

### Our Standards
- Be respectful and constructive
- Welcome newcomers and help them learn
- Focus on what's best for the community
- Accept feedback gracefully

---

## 🎯 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**Good bug reports include:**
- Clear, descriptive title
- Steps to reproduce
- Expected vs. actual behavior
- Browser and OS information
- Console errors (F12 → Console)
- Screenshots if applicable

**Example:**
```markdown
**Title:** Images not loading in Safari 14

**Description:**
Question images don't appear when running exam in Safari 14.

**Steps to reproduce:**
1. Open exam.html in Safari 14
2. Start AI-900 exam
3. Navigate to question with image

**Expected:** Image displays
**Actual:** Placeholder shown

**Console errors:**
Failed to load resource: user-content/exams/ai900/images/diagram.jpg

**Browser:** Safari 14.0.3
**OS:** macOS 11.2
```

---

### Suggesting Features

Feature requests are welcome! Please provide:
- Clear description of the feature
- Use cases and benefits
- Proposed implementation (if you have ideas)
- Mock-ups or examples (if applicable)

---

### Contributing Code

#### Good First Issues
Look for issues labeled:
- `good first issue` - Simple tasks for beginners
- `help wanted` - Tasks that need attention
- `documentation` - Improve docs

#### Areas to Contribute
- **UI/UX improvements** - Enhance visual design
- **Accessibility** - Screen reader support, keyboard nav
- **Performance** - Optimize loading and rendering
- **Question types** - Add new question formats
- **Bug fixes** - Fix reported issues
- **Documentation** - Improve guides and examples

---

## 🛠️ Development Setup

### Prerequisites
- Modern web browser (Chrome 80+, Firefox 75+, etc.)
- Python 3.6+ OR Node.js 12+ (for local server)
- Git
- Text editor (VS Code recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/rmssantos/examsimcreator.git
cd examsimcreator/portable

# Start development server
python server.py
# OR
npx http-server -p 8000

# Open browser
http://localhost:8000
```

### Development Workflow

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Edit files in `portable/` folder
   - Test locally with server running

3. **Test thoroughly**
   - Test in multiple browsers
   - Check console for errors
   - Verify all question types work
   - Test both light and dark modes

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "Add feature: clear description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

---

## 📁 Project Structure

```
portable/
├── index.html              # Homepage (exam selection)
├── exam.html               # Exam simulator
├── editor.html             # Question editor
├── server.py               # Development server
│
├── exam-manager.js         # Exam detection & management
├── exam-loader.js          # Dynamic exam loading
├── image-loader.js         # Image handling system
├── script-multi-exam.js    # Main exam logic
├── editor.js               # Editor functionality
│
├── style-new.css           # Core styles
├── modern-enhancements.css # Modern UI styles
├── multi-exam-styles.css   # Multi-exam support
│
├── user-content/
│   └── exams/              # User exam data
│       ├── ai900/
│       └── ai102/
│
└── docs/                   # Documentation
```

### Key Files

| File | Purpose |
|------|---------|
| `exam-manager.js` | Detects exams, manages activation state |
| `exam-loader.js` | Loads exam data from folders/localStorage |
| `script-multi-exam.js` | Exam logic, timer, navigation, scoring |
| `image-loader.js` | Resolves and loads images |
| `editor.js` | Question editor functionality |

---

## 💻 Coding Standards

### JavaScript

#### Style
- Use camelCase for variables and functions
- Use PascalCase for classes
- Use UPPER_CASE for constants
- 2 spaces for indentation (not tabs)
- Semicolons required
- Single quotes for strings

#### Best Practices
```javascript
// ✅ Good
function loadExamData(examId) {
    const examData = window.userExams[examId];
    if (!examData) {
        console.error(`Exam ${examId} not found`);
        return null;
    }
    return examData;
}

// ❌ Avoid
function LoadData(id) {
    var data = window.userExams[id]
    if(!data) return null
    return data
}
```

#### Comments
```javascript
// Single-line comments for brief explanations

/**
 * Multi-line comments for functions
 * @param {string} examId - The exam identifier
 * @returns {Object|null} Exam data or null if not found
 */
function getExam(examId) {
    // Implementation
}
```

---

### HTML

- Use semantic HTML5 elements
- Include ARIA labels for accessibility
- Use lowercase for attributes
- Quote attribute values
- Self-close void elements

```html
<!-- ✅ Good -->
<button id="start-exam" class="btn btn-primary" aria-label="Start exam">
    <i class="fas fa-play"></i>
    Start Exam
</button>

<!-- ❌ Avoid -->
<button id=startExam class='button'>
    Start
</button>
```

---

### CSS

- Use kebab-case for class names
- Group related properties
- Mobile-first approach
- Avoid !important when possible

```css
/* ✅ Good */
.exam-card {
    /* Layout */
    display: flex;
    flex-direction: column;

    /* Box model */
    padding: 20px;
    margin: 10px 0;
    border-radius: 8px;

    /* Visual */
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);

    /* Typography */
    color: white;
    font-size: 16px;

    /* Animation */
    transition: transform 0.3s ease;
}

.exam-card:hover {
    transform: translateY(-4px);
}
```

---

## 🧪 Testing

### Manual Testing Checklist

Before submitting a PR, test:

#### Functionality
- [ ] All exam screens load correctly
- [ ] Questions display properly
- [ ] Answers can be selected/changed
- [ ] Navigation works (Prev/Next)
- [ ] Timer counts down correctly
- [ ] Results calculate accurately
- [ ] Progress tracking persists
- [ ] Editor saves/loads questions

#### Question Types
- [ ] STANDARD (single choice)
- [ ] MULTI (multiple choice)
- [ ] SEQUENCE (ordering)
- [ ] DRAG_DROP_SELECT (drag & drop)
- [ ] YES_NO_MATRIX (matrix)

#### Browsers
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

#### Modes
- [ ] Server mode (`python server.py`)
- [ ] File mode (double-click index.html)

#### Themes
- [ ] Light mode displays correctly
- [ ] Dark mode displays correctly
- [ ] Theme toggle works
- [ ] Preference persists

---

### Testing Images

```bash
# Test image loading
1. Start server
2. Open exam with images
3. Check browser console for 404 errors
4. Verify images display correctly
```

---

### Testing Storage

```bash
# Check localStorage
1. Open browser DevTools (F12)
2. Go to Application → Local Storage
3. Verify keys exist:
   - custom_ai900_questions
   - exam_metadata_ai900
   - examHistory
4. Test clearing storage
5. Verify data reloads correctly
```

---

## 🔄 Pull Request Process

### Before Submitting

1. **Test thoroughly** - Follow the testing checklist
2. **Update documentation** - If adding features, update README.md
3. **Clean commits** - Use clear commit messages
4. **No merge conflicts** - Rebase on latest main if needed

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested in Chrome
- [ ] Tested in Firefox
- [ ] Tested in Safari
- [ ] Tested server mode
- [ ] Tested file mode
- [ ] Tested dark mode

## Screenshots
(if applicable)

## Related Issues
Fixes #123
```

### Review Process

1. **Automated checks** - Linting, basic validation
2. **Code review** - Maintainer reviews code
3. **Testing** - Maintainer tests functionality
4. **Approval** - Changes approved or feedback given
5. **Merge** - PR merged into main

---

## 📝 Commit Message Guidelines

### Format
```
type(scope): Short description

Longer description if needed.

Fixes #123
```

### Types
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting, whitespace
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Testing
- `chore` - Maintenance

### Examples
```bash
feat(editor): Add bulk question import
fix(timer): Prevent timer from continuing after exam end
docs(readme): Update installation instructions
style(css): Improve dark mode contrast
refactor(exam-loader): Simplify detection logic
```

---

## 🏗️ Architecture Notes

### Storage Strategy

Questions are stored in two places:
1. **localStorage** - Persistent across sessions
2. **window.userExams** - In-memory for current session

Both must be updated when saving to ensure consistency.

### Exam Loading Priority

1. `window.userExams` (from user-content/exams/)
2. `localStorage` (manual imports)
3. Embedded dumps (fallback)

### Image Resolution

Images are resolved in this order:
1. `user-content/exams/{examId}/images/{filename}`
2. `images/{filename}` (legacy)
3. Placeholder (if not found)

---

## 🎨 Design Guidelines

### UI Principles
- **Clean and minimal** - Avoid clutter
- **Consistent spacing** - Use 8px grid
- **Accessible colors** - WCAG AA compliance
- **Responsive** - Works on all screen sizes
- **Fast interactions** - Immediate feedback

### Color Palette

**Light Mode:**
- Primary: `#667eea`
- Success: `#28a745`
- Danger: `#dc3545`
- Warning: `#ffc107`

**Dark Mode:**
- Background: `#1e1e1e`
- Surface: `#2d2d2d`
- Text: `#e0e0e0`

---

## 🐛 Debugging Tips

### Browser Console
```javascript
// Check if exams loaded
console.log(window.userExams);

// Check storage
console.log(localStorage);

// Debug exam detection
window.examManager.detectAvailableExams().then(console.log);
```

### Common Issues

**Images not loading:**
- Check paths in dump.json
- Verify files exist
- Use server mode (not file://)

**Storage not persisting:**
- Check localStorage quota
- Verify browser settings
- Clear cache and retry

**Exams not detected:**
- Check folder structure
- Verify dump.json format
- Check console for errors

---

## 📚 Resources

### Learning Resources
- [MDN Web Docs](https://developer.mozilla.org/)
- [JavaScript.info](https://javascript.info/)
- [CSS Tricks](https://css-tricks.com/)

### Tools
- [VS Code](https://code.visualstudio.com/)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [JSON Validator](https://jsonlint.com/)

---

## 🙋 Questions?

If you have questions about contributing:
1. Check existing documentation
2. Search existing issues on [GitHub](https://github.com/rmssantos/examsim/issues)
3. Open a new issue with `question` label
4. Reach out to maintainers

---

**Thank you for contributing! 🎉**
