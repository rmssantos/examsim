# Copilot Review Instructions

This repository is a static, offline-first exam simulator built with vanilla HTML, CSS, JavaScript, and a small local Python HTTP server.

When reviewing pull requests:

- Treat all exam dumps, metadata, localStorage, IndexedDB data, imported ZIP/JSON files, query strings, and uploaded filenames as untrusted input.
- Flag DOM XSS risks, especially `innerHTML`, template strings inserted into the DOM, unsafe URLs, unsafe icon/class interpolation, and event-handler attributes.
- Prefer DOM APIs such as `createElement`, `textContent`, `setAttribute` with validation, and allowlisted class names for user-controlled content.
- Preserve the offline-first behavior. Do not introduce new external CDN/runtime dependencies unless there is a clear security reason and the dependency is pinned or vendored locally.
- Check local file upload paths in `server.py` for path traversal, response splitting, unsafe CORS, excessive payload size, and broad network binding.
- Keep changes minimal and consistent with the existing no-build, browser-native architecture.
- Pay attention to question schema compatibility: `STANDARD`, `MULTI`, `YES_NO_MATRIX`, `SEQUENCE`, and `DRAG_DROP_SELECT` must remain supported.
- For PRs that touch exam navigation, bootstrap, or keyboard handlers, check for duplicate event listeners and repeated initialization.
- For PRs that touch storage, confirm data remains local to the browser unless the user explicitly opts into export/import.
- Write concise review comments in Portuguese when practical.

---

## Git, commit, branch & CI/CD workflow

These rules apply to any automated or assisted change in this repository. The goal is small, reviewable, reversible steps — never one large "big bang" commit.

### Branching
- Never commit directly to `master`. Always work on a topic branch and open a PR.
- Use prefixes: `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`, `content/` (e.g., `content/az900-az104-packs`).
- One branch = one coherent theme. Do not mix unrelated workstreams (e.g., a new exam pack and an app-wide refactor) on the same branch.

### Commits — commit incrementally, not all at once
- Commit as you complete each logical unit of work, not in a single dump at the end. A change touching thousands of lines must be split into several focused commits.
- One concern per commit. Keep exam-content changes, JS/runtime changes, tooling/validator changes, tests, and docs in separate commits.
- Use Conventional Commits: `type(scope): summary` (`feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`). See `CONTRIBUTING.md` for examples.
- Stage deliberately (`git add <paths>`), never blind `git add -A`, so unrelated or private files are not swept in.
- Keep commits reversible: prefer many small commits that each pass validation over one that cannot be cleanly reverted.

### Pull requests
- Keep PRs focused and small enough to review in one sitting. If a change spans content + code + tooling, prefer separate PRs (or at least separate, well-labeled commits) per concern.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md` and list the exact validation commands run.
- Target `master`; request Copilot/code-owner review.

### Local gates before every commit and push (mirror CI in `.github/workflows/validate.yml`)
Run and confirm green before committing:
- `python tools/validate-exam-packs.py --root user-content/exams`
- `python -m unittest discover -s tests -p "test_*.py"`
- For changed JS: `node --check <file>` (CI checks all of `assets/js` plus `service-worker.js`).
- For changed Python tools: `python -m py_compile <file>`.

Note: on PowerShell, `python -m unittest` may report exit code 1 even when output ends in `OK`; treat trailing `OK` as success.

### Content & privacy safety
- Keep `.local/` planning notes, private ZIPs, and personal browser data out of commits.
- When adding an exam pack, add its `.gitignore` allowlist pair (`!.../<id>/` and `!.../<id>/**`), register it in `index.json` and `analytics.js` `publicExamIds`, and confirm the validator's pack/question counts update.
- Exclude work-in-progress or off-limits packs when instructed; if a pack is excluded, also remove it from `index.json` so the index never points to a missing pack.
