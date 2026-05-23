# Plan 2: PWA and Storage Migration

## Goal

Make Exam Simulator installable, more reliable offline, and safer for larger local packs by moving heavy user-owned data toward IndexedDB while preserving the current static/no-build architecture.

## Current State

- The app is already static and mostly offline-capable.
- Images imported from ZIP are stored in IndexedDB through `assets/js/image-storage.js`.
- Imported questions and progress still primarily use `localStorage`.
- There is no `manifest.webmanifest` or `service-worker.js`.
- Mobile/accessibility audit is tracked separately in Plan 4.

## Proposal

Deliver this in two stages:

1. PWA shell and installability.
2. Gradual storage migration for large packs and detailed progress.

## Stage 1: PWA Shell

Add a browser-native PWA implementation with no Workbox or CDN dependency.

### Tasks

- Add `manifest.webmanifest`.
- Add `service-worker.js`.
- Register the service worker from `index.html`, `exam.html`, and `editor.html`.
- Cache-first static assets:
  - HTML shell files
  - CSS
  - JS
  - vendored Font Awesome and JSZip assets
  - public exam metadata/dumps that are already part of the repo
- Network-first for `user-content/exams/index.json` so GitHub Pages can pick up newly published packs.
- Keep analytics network calls out of the service worker cache.

### Acceptance Criteria

- Browser install prompt is available where supported.
- Reload works while offline after first successful visit.
- Existing file import and ZIP import flows still work.
- No external service-worker library is introduced.

## Stage 2: Storage Migration

Move large user-owned data out of `localStorage` without breaking existing users.

### Proposed Storage Split

| Data | Storage |
|------|---------|
| Theme, locale, analytics opt-out, activation config | `localStorage` |
| Exam registry and lightweight metadata index | `localStorage` |
| Imported questions/dumps | IndexedDB |
| Imported images | IndexedDB |
| Detailed progress and future per-question stats | IndexedDB |

### Tasks

- Add `assets/js/exam-storage.js` as a small IndexedDB wrapper.
- Read from IndexedDB first, then fallback to existing `custom_<examId>_questions` keys.
- Migrate existing localStorage exams opportunistically after successful load.
- Keep export/import paths explicit so data remains local unless the user chooses to export/import.
- Add clear storage error messages for quota failures.

### Acceptance Criteria

- Existing localStorage imports continue to load.
- New large imports can exceed practical localStorage limits without failing early.
- Removing an exam deletes associated questions, metadata, progress, and images.
- Privacy documentation reflects the new split.

## Suggested Files

- `manifest.webmanifest`
- `service-worker.js`
- `index.html`
- `exam.html`
- `editor.html`
- `assets/js/exam-storage.js`
- `assets/js/exam-loader.js`
- `assets/js/exam-manager.js`
- `assets/js/homepage.js`
- `assets/js/script-multi-exam.js`
- `PRIVACY-AND-STORAGE.md`

## Risks

- Service worker cache bugs can make updates appear stale.
- IndexedDB migration must be backwards-compatible and recoverable.
- GitHub Pages CSP may need small adjustments if new fetch patterns are introduced.

## Out of Scope

- Multi-device sync.
- Account login.
- Server-side storage.
- Study mode/spaced repetition implementation details, except storage prerequisites needed by Plan 1.
- Mobile/a11y polish, which belongs to Plan 4.
