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

## Ownership Rules
- Put reusable tokens, typography, base layout, and print behavior in `assets/css/style-new.css` only.
- Put exam runtime states in `assets/css/exam-enhancements.css`; this includes question layout, answers, feedback, progress, timer, and results.
- Put homepage-only cards, library, import affordances, and sidebar styles in `assets/css/homepage-styles.css` or `assets/css/index-inline.css`.
- Put editor-only form, preview, validation, and modal styles in `assets/css/editor-styles.css`.
- Put cross-page decorative transitions or dark-mode body behavior in `assets/css/modern-enhancements.css` only when at least two pages use it.
- Put question-type labels and compact badges in `assets/css/multi-exam-styles.css`.

## Change Checklist
- Before adding a rule, confirm which page owns the component and avoid adding page-specific selectors to shared files.
- Prefer existing design tokens from `style-new.css`; add a new token only when at least two files need it.
- Do not duplicate selectors across CSS files unless one file is intentionally overriding a shared baseline for a page.
- When removing or moving CSS, smoke test `index.html`, `exam.html?exam=sc900`, and `editor.html` in light and dark themes.
- Keep the no-build architecture: do not introduce CSS preprocessors or runtime CDN dependencies.

## Design Tokens
All tokens are centralized in `assets/css/style-new.css` :root. Other files reference them via var().

## Page Architecture
- `index.html` — Single-page app with 3 screens: welcome, exam, results (all in DOM, toggled by CSS class)
- `exam.html` — Standalone exam page (opened via exam.html?exam=<id>), contains same exam/results DOM
- `editor.html` — Standalone question editor

The exam DOM is duplicated between index.html and exam.html by design.
Both pages use the same MultiExamSimulator class from `assets/js/script-multi-exam.js`.
