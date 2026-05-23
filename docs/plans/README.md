# Growth and Retention Plans

This folder tracks the plans selected from the May 2026 growth review. The numbering follows the prioritized list agreed after reviewing the current repository state.

## Scope

| Plan | Status | Goal |
|------|--------|------|
| [Plan 1: Study Mode and Spaced Repetition](plan-01-study-mode-spaced-repetition.md) | Accepted | Turn one-shot exam attempts into a daily review loop. |
| [Plan 2: PWA and Storage Migration](plan-02-pwa-storage-migration.md) | Accepted | Make the app installable/offline-friendly and move large local data toward IndexedDB. |
| Plan 3: Public 5-question Demo | Deferred | Useful, but intentionally ignored for now. |
| [Plan 4: Mobile and Accessibility Audit](plan-04-mobile-a11y-audit.md) | Accepted | Polish the existing mobile, keyboard, focus, and contrast experience. |
| Plan 5: Community Pack Index and Marketplace | Deferred | Interesting, including legal questions, but postponed for now. |

## Working Principles

- Preserve the static, offline-first, no-build architecture.
- Treat all exam packs, metadata, URLs, filenames, and imported content as untrusted input.
- Keep official/proprietary exam content out of the public repository.
- Prefer small, reversible changes with browser-native APIs.
- Keep deferred marketplace work out of active implementation plans until explicitly re-opened.

## Recommended Order

1. Ship Plan 2 foundation first if PWA/storage risk blocks later larger local data.
2. Ship Plan 1 once storage can safely support per-question study stats.
3. Run Plan 4 alongside both, focusing on small-screen and keyboard regression checks.
4. Revisit Plan 3 only when first-use conversion becomes the top priority.
5. Revisit Plan 5 only after schema, content policy, takedown, and legal review are intentionally scheduled.
