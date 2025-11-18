# Changelog

All notable changes to the Azure AI Exam Simulator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.0.0] - 2025-01-13

### 🎉 Major Release - UI/UX Overhaul

This release focuses on improving the user experience with a complete UI overhaul, fixing critical dark mode issues, and enhancing progress tracking.

### Added

#### Progress Tracking
- **Global Progress Dashboard** on homepage showing stats across all exams
- **Detailed Review Section** in results screen showing all questions with:
  - User's answer vs correct answer comparison
  - Color-coded status (correct/incorrect/skipped)
  - Question preview (first 120 characters)
- **Pass Rate Calculation** across all exam attempts
- **Export Progress** functionality to download all progress data as JSON
- **Per-Exam Statistics** with performance trends (📈 improving, 📉 declining, ➖ stable)

#### UI Enhancements
- **Compact UI Design** with optimized spacing throughout the application
- **Question Type Indicators** with visual badges for special question types
- **Enhanced Readability** with better font sizes and line heights
- **Answer Feedback Animations** for correct/incorrect answers
- **Progress Bars** with smooth transitions and shine effects

#### Documentation
- **CHANGELOG.md** - This file documenting all changes
- **Updated README.md** with v2.0 features and troubleshooting
- **Updated QUICKSTART.md** with new features and common issues
- **Version badge** updated to 2.0.0

### Fixed

#### Dark Mode Issues (Critical)
- ✅ Fixed dark mode selector mismatch (`[data-theme="dark"]` vs `.dark-mode` class)
- ✅ Added `.dark-mode` selectors to ALL CSS files:
  - `exam-enhancements.css` (30+ selectors)
  - `homepage-styles.css` (all dark mode rules)
  - `style-new.css` (all dark mode rules)
- ✅ Fixed Interactive Features cards not visible in dark mode
- ✅ Fixed Progress cards with light text on light backgrounds
- ✅ Added `!important` flags to ensure dark mode styles override properly
- ✅ Increased opacity on dark mode badges for better contrast

#### Progress Display Issues
- ✅ Fixed Progress cards showing no data on homepage
- ✅ Implemented global progress calculation when no exam is selected
- ✅ Progress now aggregates data from all exams in localStorage

#### Layout Issues
- ✅ Fixed giant empty space before answer feedback popup
  - Changed `.question-container` min-height from `calc(100vh - 200px)` to `auto`
  - Changed `#answer-feedback` position from `absolute` to `static`
  - Reduced `.question-controls` min-height to 0
- ✅ Fixed results screen missing colors for pass/fail status
- ✅ Fixed question text bars having excessive height
- ✅ Fixed show answer popup appearing far below navigation buttons

### Changed

#### UI/UX Improvements
- **Reduced padding and margins** throughout the application by 20-40%
- **Compacted question text** from large bars to comfortable readable blocks
- **Reduced button sizes** while maintaining clickability
- **Optimized font sizes** for better readability (0.875rem - 0.9375rem)
- **Improved spacing** in navigation buttons and controls
- **Enhanced feedback panel** with better positioning and animations

#### Progress Tracking
- **Homepage Progress Cards** now show global stats instead of requiring exam selection
- **Total Attempts** counts all attempts across all exams
- **Best Score** shows highest score from any exam
- **Pass Rate** calculates overall pass percentage
- **View Detailed Stats** button shows per-exam breakdowns

#### Theme System
- **Consistent theme toggle** across all pages (homepage, exam, results, editor)
- **Theme preference** saved to localStorage and persists across sessions
- **Smooth transitions** between light and dark modes
- **High contrast** colors in dark mode for accessibility

### Removed

#### Cleanup
- ✅ Removed temporary log files (`console.log`, `inspect.log`)
- ✅ Removed development scripts (`fix-dark-mode.py`)
- ✅ Cleaned up unused CSS selectors

### Technical Details

#### CSS Changes
- **exam-enhancements.css** (1411 lines)
  - Added 30+ `.dark-mode` selectors for comprehensive dark mode support
  - Compacted spacing with reduced padding/margins
  - Fixed `.question-container` min-height issue
  - Changed `#answer-feedback` positioning from absolute to static
  - Added `!important` flags for dark mode color enforcement

- **homepage-styles.css** (395 lines)
  - Added `.dark-mode` to all dark mode rules
  - Enhanced feature cards with proper contrast
  - Fixed progress items visibility in dark mode
  - Added `!important` flags for critical dark mode styles

- **style-new.css** (all dark mode selectors updated)
  - Batch-added `.dark-mode` to all `[data-theme="dark"]` rules
  - Maintained backward compatibility with both selectors

#### JavaScript Changes
- **script-multi-exam.js** - `updateProgressDisplay()` method (lines 1355-1400)
  - Added global progress calculation for homepage
  - Aggregates stats from all exams when no exam is selected
  - Iterates through localStorage to find all `*_progress` keys
  - Calculates total attempts, best score, and pass rate

- **script-multi-exam.js** - `generateDetailedReview()` method (lines 1234-1335)
  - New method to generate comprehensive question review
  - Shows all questions with user's answer vs correct answer
  - Handles all question types (standard, multi, sequence, Y/N matrix, drag-select)
  - Color-coded status indicators
  - Question preview with truncation

### Browser Compatibility

Tested and confirmed working on:
- ✅ Chrome 120+
- ✅ Firefox 121+
- ✅ Edge 120+
- ✅ Safari 17+

### Migration Notes

No breaking changes. Users can upgrade from v1.x to v2.0 seamlessly:
- All existing progress data preserved
- localStorage keys unchanged
- Exam data format compatible
- No action required from users

### Known Issues

None! All major bugs from v1.x have been resolved.

---

## [1.0.0] - 2024-10-01

### Initial Release

#### Core Features
- Multi-exam support with dynamic detection
- 5+ question types (standard, multi, sequence, drag-select, Y/N matrix)
- Visual question editor
- Basic progress tracking
- Dark/light mode toggle
- Image support for questions and explanations
- Timed exams with countdown
- Keyboard shortcuts

#### Exam Features
- Question navigation (prev/next)
- Mark for review
- Show answer with explanations
- Finish exam with results screen
- Pass/fail status
- Score calculation

#### Editor Features
- Visual question editor
- Import/Export JSON
- Metadata configuration
- localStorage persistence

#### Known Issues (Fixed in 2.0)
- ❌ Dark mode not applying to homepage elements
- ❌ Giant empty space before answer feedback
- ❌ Progress cards not showing data
- ❌ Results screen missing colors
- ❌ Large spacing issues throughout UI

---

## Version History

- **v2.0.0** (2025-01-13) - UI/UX Overhaul, Dark Mode Fixes, Enhanced Progress Tracking
- **v1.0.0** (2024-10-01) - Initial Release

---

## Upgrade Guide

### From v1.0 to v2.0

1. **Backup your data** (optional but recommended):
   ```javascript
   // Export progress from browser console
   localStorage.getItem('ai900_progress')
   localStorage.getItem('ai102_progress')
   ```

2. **Clear browser cache** (Ctrl+Shift+Delete):
   - Select "Cached images and files"
   - Clear last 4 weeks
   - This ensures new CSS loads properly

3. **Hard refresh** the page (Ctrl+Shift+R or Cmd+Shift+R)

4. **Verify dark mode** works:
   - Toggle theme button should switch properly
   - Check Interactive Features cards in dark mode
   - Verify Progress cards have proper contrast

5. **Check progress display**:
   - Homepage should show Total Attempts, Best Score, Pass Rate
   - "View Detailed Stats" should show per-exam breakdowns
   - Results screen should show Detailed Review section

That's it! Your data is preserved and all new features work automatically.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on:
- Reporting bugs
- Suggesting features
- Submitting pull requests
- Code style and standards

---

## Support

- **Issues**: https://github.com/rmssantos/examsim/issues
- **Documentation**: [README.md](./README.md)
- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)

---

**For more details, see the [full documentation](./README.md).**
