# Changelog

Notable public changes are recorded here. Dates use `YYYY-MM-DD`.

## Unreleased

### Added

- Added a limited 30% launch offer across paid-preview cards, purchase modals,
  roadmaps, results upsells, and exam landing pages.
- Added a free 25-question AB-620 preview with one guided Copilot Studio lab and
  a Complete-pack path for 280 questions and eight labs.
- Added a library filter for exams that include accessible or Complete-pack
  hands-on labs.

### Changed

- Kept all hosted Home links on the clean site root instead of exposing
  `index.html`, including the hands-on labs header and Back to Home action.
- Show hands-on lab actions only when a pack contains accessible labs or a
  trusted bundled preview advertises labs in its Complete pack; locked lab
  actions now open the unlock flow instead of leading to an empty page.
- Made lab summaries and exam landing copy vendor-neutral, including explicit
  licensing, cost, and clean-up guidance instead of assuming an Azure free tier.
- Clarified the distinction between local/offline use and telemetry on the
  public deployment.
- Reduced public exam metadata to stable provenance fields.
- Consolidated and updated the public documentation.
- Removed internal commercial workflow and review-status details from public
  files.
- Hardened imported exam metadata, question identifiers, and legacy Study Mode
  storage migration against malformed or excessively complex data.
- Reduced Study Mode analytics to session milestones and aggregate completion
  statistics, with matching privacy documentation.
- Revalidated JSZip through the service worker while retaining the offline
  fallback and limiting cache cleanup to Examplar-owned caches.
- Scoped service-worker cache lookups to the current Examplar caches while
  preserving offline fallbacks.

## 2.0.1 - 2025-12-12

### Added

- Local image upload support through `server.py`.

### Changed

- Improved dynamic exam loading and image isolation.
- Reduced HTML injection risk when rendering imported content.
- Stabilized timer and theme behavior.

## 2.0.0 - 2025-01-13

### Added

- Multi-exam library and visual question editor.
- Detailed results review and progress tracking.
- Light and dark themes.
- Support for multiple question types.

## 1.0.0 - 2024-10-01

- Initial public release.
