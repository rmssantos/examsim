# Examplar Phase 1–2 Foundations Design

## Scope

Implement the first two phases of the 90-day audit plan:

1. Integrity and measurement.
2. Freshness and activation.

Phase 3 certification production remains gated by monitored demand. This change prepares
SC-500 and AB-620 measurement but does not build those packs.

## Product integrity

- Make editor dirty-state compare the exact persisted question representation.
- Make the exam timer derive remaining time from a wall-clock deadline.
- Keep clean routes consistent between the browser router, service worker, and local server.
- Preserve current full-pack import/upgrade behavior while making replacement explicit.

## Security

- Protect local image writes with strict loopback Host/Origin checks and a per-process CSRF token.
- Treat every stored/imported pack as local and unverified, regardless of its metadata claims.
- Put bounded schemas around all imported arrays and labs before persistence/rendering.
- Decompress ZIP imports inside a dedicated, terminable Web Worker with actual-byte
  budgets and a main-thread timeout. Declared sizes remain early-rejection hints only.

## Measurement

- Capture only bounded campaign values and persist them in `sessionStorage` for the current tab.
- Carry attribution from landing page to exam events without a persistent visitor identifier.
- Add events for landing CTA, session configuration, and the first answered question.
- Add acquisition/campaign tables to the local-only analytics dashboard.

## Activation and trust

- Add a ten-question diagnostic session driven by explicit URL parameters and existing sampling.
- Keep the full timed session available as a secondary action.
- Clarify bundled versus full-catalog question counts and telemetry language.
- Make objective/review dates visible on generated landing pages.
- Correct H1 structure and include the roadmaps canonical URL in generated sitemap output.

## Editorial freshness and organic content

- Apply only verified deltas from current official study guides to SC-900, AB-730, AB-731,
  AZ-400, DP-900, and DP-700.
- Regenerate manifests and SEO pages after content changes.
- Prepare eight LinkedIn drafts with one purpose and one measurable deep link each.
- Do not publish posts or make external marketing changes in this implementation.

## Testing strategy

Every behavior change follows RED–GREEN–REFACTOR. Focused Node/Python tests cover pure
logic and boundaries; browser smoke covers the editor, route, diagnostic, and landing journey.
The final gate is the full Python suite, pack validation/manifests, Ruff, JavaScript syntax,
local dashboard tests, and Playwright smoke.
