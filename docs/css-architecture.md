# CSS Architecture

## File Structure
- `assets/css/style-new.css` — Design tokens (:root variables), base typography, core layout, print styles
- `assets/css/exam-enhancements.css` — Authoritative exam screen styles (header, questions, options, feedback, results)
- `assets/css/modern-enhancements.css` — Visual effects (glassmorphism, animations, dark mode body)
- `assets/css/multi-exam-styles.css` — Question type badges and indicators
- `assets/css/homepage-styles.css` — Homepage-only styles (exam library, hero, sidebar)
- `assets/css/index-inline.css` — Index page specific components (import modal, drop zone, image placeholders)
- `assets/css/editor-styles.css` — Editor page layout and form styles

## Loading
- `index.html` loads all files
- `exam.html` loads shared CSS except `assets/css/homepage-styles.css`
- `editor.html` loads Font Awesome plus `assets/css/editor-styles.css`

## Design Tokens
All tokens are centralized in `assets/css/style-new.css` :root. Other files reference them via var().

## Page Architecture
- `index.html` — Single-page app with 3 screens: welcome, exam, results (all in DOM, toggled by CSS class)
- `exam.html` — Standalone exam page (opened via exam.html?exam=<id>), contains same exam/results DOM
- `editor.html` — Standalone question editor

The exam DOM is duplicated between index.html and exam.html by design.
Both pages use the same MultiExamSimulator class from `assets/js/script-multi-exam.js`.
