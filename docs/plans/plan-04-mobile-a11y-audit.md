# Plan 4: Mobile and Accessibility Audit

## Goal

Polish the existing mobile, keyboard, focus, and contrast experience across the core simulator flows.

## Current State

- The app already has responsive CSS in several stylesheets.
- Many buttons already have `aria-label` or visible text.
- `SEQUENCE` has drag plus up/down button controls.
- `YES_NO_MATRIX` has keyboard support.
- `DRAG_DROP_SELECT` is already click/tap based, which is helpful for mobile.
- `prefers-reduced-motion` exists in CSS.
- A focused audit is still needed on small screens and assistive workflows.

## Target Viewports

- 360 x 740
- 390 x 844
- 414 x 896
- 768 x 1024

## Audit Scope

Homepage:

- Exam cards.
- Details panel.
- Module selection.
- Import entry points.
- Manage exams modal.

Exam flow:

- Header with timer, question counter, navigator, and close/switch action.
- Question text and images.
- All supported question types.
- Mark for review and show answer controls.
- Finish confirmation modal.

Results:

- Score summary.
- Performance insights.
- Detailed review pagination.
- Back/restart actions.

## Accessibility Tasks

- Ensure every icon-only button has a meaningful accessible name.
- Replace clickable `div` patterns with `button` where practical.
- Where a non-button clickable element remains, ensure role, tabindex, and keyboard behavior are correct.
- Confirm focus trap and focus restoration in modals.
- Add clear focus styles in light and dark mode.
- Verify question navigator buttons announce current, answered, marked, and unanswered states.
- Ensure `DRAG_DROP_SELECT` chips and remove buttons have accessible labels.
- Ensure `SEQUENCE` up/down buttons have accessible labels that include the item or position.
- Confirm `YES_NO_MATRIX` controls are understandable by screen readers.
- Respect `prefers-reduced-motion` for theme and feedback animations.

## Mobile Tasks

- Ensure primary touch targets are at least 44px high/wide.
- Remove horizontal overflow in the target viewports.
- Ensure long question text, options, and explanations wrap cleanly.
- Prevent header controls from overlapping.
- Keep images responsive and non-overlapping.
- Ensure results cards and detailed review remain readable on narrow screens.
- Confirm all question types can be answered without a mouse.

## Suggested Files

- `index.html`
- `exam.html`
- `editor.html`
- `assets/js/homepage.js`
- `assets/js/script-multi-exam.js`
- `assets/js/editor.js`
- `assets/css/homepage-styles.css`
- `assets/css/exam-enhancements.css`
- `assets/css/editor-styles.css`
- `assets/css/style-new.css`
- `docs/UI-UX.md`

## Acceptance Criteria

- No horizontal page overflow in target viewports.
- A keyboard-only user can select an exam, answer all supported question types, finish, and review results.
- Touch users can answer `SEQUENCE` and `DRAG_DROP_SELECT` without relying on HTML drag events.
- Icon-only controls have accessible names.
- Modal focus behavior is predictable.
- Light and dark themes keep visible focus and acceptable contrast.

## Out of Scope

- I18n/dictionary work.
- PWA/service worker implementation.
- Study mode scheduler.
- Marketplace/community pack browsing.
