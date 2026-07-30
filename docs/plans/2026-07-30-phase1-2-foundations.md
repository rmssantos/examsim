# Examplar Phase 1–2 Foundations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Examplar safer, measurable, current, and easier to start before validating new certification packs.

**Architecture:** Preserve the static/local-first architecture. Add small pure helpers at existing boundaries, keep telemetry session-scoped and aggregate, reuse the existing exam sampler for diagnostics, and regenerate derived pages/manifests from metadata instead of hand-editing generated artifacts.

**Tech Stack:** Vanilla JavaScript, HTML/CSS, Python standard library, Azure Application Insights KQL, unittest, Node VM tests, Playwright.

---

### Task 1: Persisted editor dirty-state

**Files:**
- Modify: `assets/js/editor.js`
- Modify: `tests/browser-smoke.mjs`

**Step 1: Write the failing browser test**

Extend the built-in editor scenario to reload/select a clean pack, change only
`#qExplanation`, dispatch the input event, and require the save status to match
`/saves as a copy/i`. Add a second assertion that simply viewing the pack stays clean.

**Step 2: Run the browser smoke and verify RED**

Run the existing smoke server plus:

```powershell
$env:SMOKE_BASE_URL='http://127.0.0.1:4173'
npm run test:browser
```

Expected: FAIL because the explanation is absent from `hashItems()`.

**Step 3: Implement the minimal fix**

- Remove the unused render-only `_meta` mutation from `ensureFields()`.
- Make `hashItems(items)` serialize the exact persisted item array rather than a whitelist.
- Do not expose test-only production APIs.

**Step 4: Verify GREEN**

Run browser smoke and `python -m unittest tests.test_editor_ui_readiness -v`.

**Step 5: Commit**

```bash
git add assets/js/editor.js tests/browser-smoke.mjs
git commit -m "fix(editor): track all persisted question edits"
```

### Task 2: Wall-clock exam timer

**Files:**
- Modify: `assets/js/script-multi-exam.js`
- Create: `tests/test_phase1_2_foundations.py`

**Step 1: Write the failing Node VM test**

Extract/expose `TimerManager` only inside the evaluated test source. Inject a fake
clock, capture the interval callback, advance 30.4 seconds, and assert 30 seconds
remain. Advance beyond the deadline and assert tick 0 plus exactly one expiry.

**Step 2: Verify RED**

```bash
python -m unittest tests.test_phase1_2_foundations.TimerManagerTests -v
```

Expected: FAIL with 59 seconds remaining under the callback-count implementation.

**Step 3: Implement the minimal fix**

- Accept `now = () => Date.now()` in the constructor.
- Store `deadlineMs`.
- On every tick set `remainingTime = max(0, ceil((deadlineMs - now()) / 1000))`.
- Stop and expire once; stale callbacks after `stop()` are no-ops.

**Step 4: Verify GREEN**

Run the focused test, JavaScript syntax check, and browser smoke.

**Step 5: Commit**

```bash
git add assets/js/script-multi-exam.js tests/test_phase1_2_foundations.py
git commit -m "fix(exam): derive timer from elapsed wall time"
```

### Task 3: Clean-route parity

**Files:**
- Modify: `server.py`
- Modify: `assets/js/router.js`
- Create: `tests/test_server_routes.py`
- Modify: `tests/test_phase1_2_foundations.py`

**Step 1: Write failing route tests**

- Assert `/roadmaps` maps to `/roadmaps.html` and `/roadmaps/` redirects to `/roadmaps`.
- Assert query strings survive the static mapping.
- In a Node VM, assert localhost without a controlling service worker returns
  `roadmaps.html`; with a controller, `/roadmaps` is allowed.

**Step 2: Verify RED**

```bash
python -m unittest tests.test_server_routes tests.test_phase1_2_foundations.RouterTests -v
```

**Step 3: Implement the minimal fix**

- Add roadmaps to both Python route maps.
- Treat an active service-worker controller, not hostname alone, as browser proof
  that clean routes are available.

**Step 4: Verify GREEN**

Run focused tests and browser smoke.

**Step 5: Commit**

```bash
git add server.py assets/js/router.js tests/test_server_routes.py tests/test_phase1_2_foundations.py
git commit -m "fix(routes): keep local and clean URLs in sync"
```

### Task 4: Session-scoped attribution and activation events

**Files:**
- Modify: `assets/js/analytics.js`
- Modify: `assets/js/exam-init.js`
- Modify: `assets/js/script-multi-exam.js`
- Modify: `tools/generate-exam-pages.py`
- Modify: `tests/test_analytics_attribution.py`
- Modify: `tests/test_conversion_funnel.py`
- Modify: `tests/test_exam_seo_pages.py`
- Modify: `privacy-and-storage.html`
- Modify: `PRIVACY-AND-STORAGE.md`

**Step 1: Write failing attribution tests**

Extend the Node harness with `sessionStorage`. Assert:

- Valid `ref`, source, medium, campaign, and content persist for the tab.
- A later same-origin exam URL without query parameters inherits the bounded values.
- Invalid/PII-like values are rejected before storage.
- A new explicit campaign replaces the previous campaign.
- No full referrer URL or persistent visitor ID is stored.

**Step 2: Write failing funnel-event tests**

Require bounded events:

- `landing_cta_clicked` with exam ID and action (`diagnostic` or `full`).
- `session_configured` with session type plus question-count/duration measurements.
- `exam_first_answered` exactly once per session.

**Step 3: Verify RED**

```bash
python -m unittest tests.test_analytics_attribution tests.test_conversion_funnel tests.test_exam_seo_pages -v
```

**Step 4: Implement minimal telemetry**

- Persist sanitized attribution in `sessionStorage` only.
- Add `utm_content` as `campaign_content`, bounded to the same safe character set.
- Add the three public methods/events.
- Delegate clicks only from generated `data-analytics-*` CTA attributes.
- Track session configuration in `exam-init.js`.
- Track first answer from `handleAnswerChanged()` with an in-memory once flag.
- Update privacy copy accurately.

**Step 5: Verify GREEN and commit**

Run focused/full tests, then:

```bash
git add assets/js/analytics.js assets/js/exam-init.js assets/js/script-multi-exam.js tools/generate-exam-pages.py tests privacy-and-storage.html PRIVACY-AND-STORAGE.md
git commit -m "feat(analytics): persist bounded campaign attribution"
```

### Task 5: Acquisition view in the local dashboard

**Files (local-only, ignored by Git):**
- Modify: `.local/analytics-dashboard/server.py`
- Modify: `.local/analytics-dashboard/dashboard.html`
- Modify: `.local/analytics-dashboard/app.js`
- Modify: `.local/analytics-dashboard/styles.css`
- Modify: `.local/analytics-dashboard/test_dashboard.py`
- Modify: `.local/analytics-dashboard/README.md`

**Step 1: Write failing dashboard tests**

Require KQL queries for acquisition source/campaign/content and an activation funnel
grouped by campaign + exam. Assert the HTML has an Acquisition section and the app
renders aggregate rows without operational PII.

**Step 2: Verify RED**

```bash
python -m unittest discover .local/analytics-dashboard -v
```

**Step 3: Implement**

- Add an `acquisition` query section.
- Union pageViews/customEvents and normalize blanks to `direct/unattributed`.
- Render source/campaign counts and landing→configured→first-answer→completion ratios.
- Keep event rows aggregate and note that ratios are event ratios, not unique users.

**Step 4: Verify GREEN**

Run local dashboard tests and query the local API with a 7-day range.

**Step 5: Synchronize local tooling**

Apply the same tested local-only files to the active checkout's
`.local/analytics-dashboard` directory. Do not commit or publish them.

### Task 6: SEO, catalog, review-date, and trust copy

**Files:**
- Modify: `index.html`
- Modify: `roadmaps.html`
- Modify: `assets/css/home-v2.css`
- Modify: `tools/generate-exam-pages.py`
- Modify: `tests/test_home_header_layout.py`
- Modify: `tests/test_roadmaps_page.py`
- Modify: `tests/test_exam_seo_pages.py`
- Modify: `tests/test_public_repository_safety.py`
- Regenerate: `exams/index.html`, `exams/*/index.html`, `sitemap.xml`
- Modify: `manifest.webmanifest`

**Step 1: Write failing structural tests**

Require:

- Exactly one intent-focused H1 on home and roadmaps; brand wordmark is not H1.
- Sitemap generator includes canonical `/roadmaps`.
- Landing facts expose objective version and last-reviewed date when metadata provides them.
- Home copy distinguishes bundled questions from the 2,849-question full catalog.
- Manifest/privacy language says local-first/offline-capable, not absolutely private.

**Step 2: Verify RED**

Run the four focused test modules.

**Step 3: Implement and regenerate**

- Replace wordmark H1s with a neutral brand element and promote the hero intent line.
- Make the home stat label explicit: questions available in this browser.
- Add a short full-catalog proof line: 900 fully free; 2,849 across Free + Complete.
- Add review facts in the generator and `/roadmaps` in `render_sitemap()`.
- Regenerate pages and sitemap using `tools/generate-exam-pages.py`.

**Step 4: Verify GREEN**

Run focused tests, generated-output freshness tests, and browser smoke.

**Step 5: Commit**

```bash
git add index.html roadmaps.html assets/css/home-v2.css tools/generate-exam-pages.py tests exams sitemap.xml manifest.webmanifest
git commit -m "feat(content): clarify catalog trust and freshness"
```

### Task 7: Ten-question diagnostic session

**Files:**
- Modify: `assets/js/exam-init.js`
- Modify: `assets/js/script-multi-exam.js`
- Modify: `assets/js/utils.js`
- Modify: `assets/js/analytics.js`
- Modify: `tools/generate-exam-pages.py`
- Modify: `assets/css/exam-landing.css`
- Modify: `tests/test_phase1_2_foundations.py`
- Modify: `tests/test_conversion_funnel.py`
- Modify: `tests/test_exam_seo_pages.py`
- Modify: `tests/browser-smoke.mjs`

**Step 1: Write failing resolver tests**

Define the contract:

- URL: `?exam=<id>&session=diagnostic&count=10`.
- Diagnostic count is fixed to 10 and clamped only when the bank has fewer questions.
- Invalid counts do not create arbitrary session sizes.
- Normal and study modes retain their current counts.
- Duration scales proportionally with a five-minute minimum.

**Step 2: Write failing browser test**

Open a generated landing, follow its primary diagnostic CTA, and assert exactly ten
questions in the active session. Assert the secondary CTA still starts the full session.

**Step 3: Verify RED**

Run focused Python tests and browser smoke.

**Step 4: Implement**

- Add a pure session-config resolver in `exam-init.js`.
- Pass `sessionType` into runtime/analytics and persist it on attempt records.
- Generate primary “Start 10-question diagnostic” and secondary “Start full practice”
  CTAs with explicit tracking attributes.
- Reuse the existing sampler/results UI; do not add an experiment or interim score.

**Step 5: Verify GREEN and commit**

Run focused/full tests and commit:

```bash
git add assets/js assets/css/exam-landing.css tools/generate-exam-pages.py tests exams
git commit -m "feat(exam): add a ten-question diagnostic entry"
```

### Task 8: Secure local image upload

**Files:**
- Modify: `server.py`
- Modify: `assets/js/editor.js`
- Modify: `service-worker.js`
- Create/modify: `tests/test_security_hardening.py`

**Step 1: Write failing integration tests**

Use `ThreadingHTTPServer` on an ephemeral port and a temporary `DIRECTORY`. Assert:

- Invalid Host cannot obtain a token.
- Missing/invalid Origin fails OPTIONS/PUT.
- Missing/wrong token fails PUT.
- Valid loopback Host + Origin + token stores a magic-valid image only under the safe path.
- The editor keeps the token in memory, sends it as a header, and retries exactly once only after a 403.
- The service worker bypasses `/__upload_session` without invoking a cache strategy.

**Step 2: Verify RED**

```bash
python -m unittest tests.test_security_hardening.LocalUploadSecurityTests -v
```

**Step 3: Implement**

- Generate `httpd.csrf_token = secrets.token_urlsafe(32)` per process.
- Add no-store `GET /__upload_session`.
- Strictly validate loopback Host and Origin for token/OPTIONS/PUT.
- Compare `X-Examplar-CSRF-Token` with `hmac.compare_digest`.
- Fetch/cache the token in memory in the editor; retry once after a 403.
- Bypass `/__upload_session` in the service worker so a process token is never cached.

**Step 4: Verify GREEN**

Run focused tests, server route tests, and editor browser smoke against `server.py`.

**Step 5: Commit**

```bash
git add server.py assets/js/editor.js service-worker.js tests/test_security_hardening.py
git commit -m "fix(security): authenticate local image uploads"
```

### Task 9: Imported-pack conflict and provenance

**Files:**
- Modify: `assets/js/exam-manager.js`
- Modify: `assets/js/exam-loader.js`
- Modify: `assets/js/homepage.js`
- Modify: `assets/js/labs.js`
- Modify: `assets/js/utils.js`
- Modify: `tests/test_security_hardening.py`
- Modify: `tests/browser-smoke.mjs`

**Step 1: Write failing boundary tests**

Require:

- An ID collision rejects before writes with `EXAM_ID_CONFLICT`.
- Explicit confirmation allows a paid/full pack to replace a preview.
- Any stored record is `source: imported`, `trust: local-unverified`.
- Forged metadata cannot restore bundled trust.
- Imported cards show `Imported · unverified` and cannot render commercial URLs.
- Official documentation allowlist applies to imported resources/labs.

**Step 2: Verify RED**

Run focused security tests.

**Step 3: Implement**

- Add an explicit overwrite option to `importExam`.
- Catch conflict in homepage and repeat only after `showCustomConfirm`.
- Derive trust from the loading channel, never metadata.
- Gate commercial CTA rendering on bundled trust.
- Add a persistent provenance badge and use the shared official-host URL validator.

**Step 4: Verify GREEN**

Run focused tests, custom-pack tests, commercial tests, roadmaps tests, and browser smoke.

**Step 5: Commit**

```bash
git add assets/js tests
git commit -m "fix(security): mark and confirm imported pack overrides"
```

### Task 10: Bounded package schema and cancellable ZIP extraction

**Files:**
- Modify: `assets/js/utils.js`
- Modify: `assets/js/exam-manager.js`
- Modify: `assets/js/exam-loader.js`
- Modify: `assets/js/homepage.js`
- Create: `assets/js/zip-import-worker.js`
- Modify: `service-worker.js`
- Modify: `tools/validate-exam-packs.py`
- Modify: `docs/Pack-Format.md`
- Modify: `tests/test_security_hardening.py`
- Modify: `tests/test_sprint1_readiness.py`

**Step 1: Write failing schema tests**

Test exact boundary and max+1 for options, statements, correct indices, images,
references, labs, steps, prerequisites, cleanup, and metadata lists. Test official
HTTPS lab references and manager no-write on invalid content.

**Step 2: Write failing ZIP worker tests**

Use a real crafted archive whose declared size is smaller than its actual inflated output
and require:

- Declared size 1 but actual output over the cap returns `ZIP_LIMIT_EXCEEDED`.
- Exact cap succeeds.
- Shared package/image budgets reject an otherwise-valid later entry.
- A deliberately stalled worker is terminated by the main-thread timeout.
- Main-thread heartbeat remains responsive during decompression.
- No production import path decompresses an entry on the main thread.

**Step 3: Verify RED**

Run focused security and validator tests.

**Step 4: Implement**

- Add generous, documented cardinality limits that exceed all current packs.
- Validate questions, metadata, and labs before persistence/rendering.
- Transfer the ZIP `ArrayBuffer` into `zip-import-worker.js`.
- Load the self-hosted JSZip inside the worker and count actual emitted bytes.
- Throw/close the worker immediately on a boundary error; the main thread also enforces
  a timeout and calls `worker.terminate()` as the hard cancellation mechanism.
- Return only already-bounded JSON/image buffers via transferable objects.
- Decode JSON with `TextDecoder`; build image blobs from bounded byte arrays on return.
- Keep declared `_data` size as early rejection only.

**Step 5: Verify GREEN and commit**

Run focused tests, validate all 14 packs/manifests, browser smoke, then:

```bash
git add assets/js service-worker.js tools/validate-exam-packs.py docs/Pack-Format.md tests
git commit -m "fix(security): bound imported packs and ZIP expansion"
```

### Task 11: Targeted official-objective refresh

**Files:**
- Modify: `user-content/exams/sc900/metadata.json`
- Modify: `user-content/exams/sc900/dump.json`
- Modify as verified: `user-content/exams/{ab730,ab731,az400,dp900,dp700}/metadata.json`
- Modify only verified affected questions in the same pack directories
- Modify/add pack-specific regression tests
- Regenerate: manifests and generated exam pages

**Step 1: Create a source-backed delta ledger**

For every pack, record current official study-guide date, objective/domain changes,
affected local question IDs, and primary-source URL. If no question is demonstrably
affected, update review metadata only and state that result.

**Step 2: Write failing content tests**

At minimum require SC-900 compliance weight 20–25%, Agent ID coverage, current unified
eDiscovery terminology, and objective/review dates matching the source-backed ledger.
Add only pack-specific assertions that represent confirmed official changes.

**Step 3: Verify RED**

Run the affected pack tests and validator.

**Step 4: Apply minimal editorial changes**

Update only affected questions, distractors, explanations, references, domain weights,
and review metadata. Preserve question count and IDs unless a source-backed replacement
is required. Avoid claims about real-exam wording/format.

**Step 5: Regenerate integrity artifacts and verify GREEN**

Run the manifest writer/checker, page generator, all pack tests, and full validation.

**Step 6: Commit**

```bash
git add user-content/exams tests exams sitemap.xml
git commit -m "content: refresh packs against July 2026 objectives"
```

### Task 12: Organic content kit

**Files:**
- Create: `docs/marketing/2026-q3-linkedin-organic-plan.md`
- Create: `docs/marketing/linkedin-posts/*.md`

**Step 1: Write the calendar and measurement contract**

Document eight weeks, two posts per week, campaign/ref naming, one-CTA rule, and the
40/25/25/10 content mix. Mark every draft `status: draft` and never publish.

**Step 2: Draft the first eight posts**

Cover SC-900 update, AI-103 sourced question, AI-103 vs AB-620, AZ-500→SC-500,
editorial methodology, one role roadmap, AB-731 personal proof, and build-in-public
results. Each factual claim must cite an official source or local metric.

**Step 3: Validate links and voice**

Require direct HTTPS Examplar URLs with source/medium/campaign/ref, no invented
testimonials, no “real exam question” claims, and one CTA maximum.

**Step 4: Commit**

```bash
git add docs/marketing
git commit -m "docs(marketing): prepare measured LinkedIn campaign drafts"
```

### Task 13: Final verification and handoff

**Files:**
- Update: `docs/plans/2026-07-30-phase1-2-foundations.md` with executed evidence
- Update local HTML audit only if finding status materially changed

**Step 1: Run all quality gates**

```bash
python -B -m unittest discover -s tests -p test_*.py
python -B tools/validate-exam-packs.py --root user-content/exams --check-manifest
ruff check .
node --check service-worker.js
```

Run `node --check` for every `assets/js/*.js`, local dashboard tests, and Playwright browser smoke.

**Step 2: Review security claims**

Confirm SEC-01 through SEC-04 have regression tests and no finding was “closed” by
weakening CSP, URL validation, or storage boundaries.

**Step 3: Inspect Git**

Review `git diff --check`, `git status`, commit history, generated output, and ensure
the ignored local dashboard was synchronized but not tracked.

**Step 4: Complete the branch**

Use `superpowers:requesting-code-review`, then
`superpowers:finishing-a-development-branch` to present merge/PR/keep options.
