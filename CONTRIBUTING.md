# Contributing to Examplar

Contributions are welcome for simulator code, accessibility, documentation,
tests, and original educational practice content.

## Before You Start

- Search existing issues and pull requests.
- Keep one coherent concern per branch.
- Never include proprietary exam content, buyer data, credentials, license
  material, analytics exports, or local planning notes.
- Treat imported JSON, ZIP files, metadata, query strings, filenames, and
  browser storage as untrusted input.

## Development Setup

```powershell
git clone https://github.com/rmssantos/examsim.git
cd examsim
npm ci
python server.py
```

Open `http://localhost:8000`.

The project intentionally uses browser-native HTML, CSS, and JavaScript with no
frontend build step. Follow existing patterns before introducing dependencies.

## Branches and Commits

Create a topic branch from current `master`:

```powershell
git switch master
git pull --ff-only
git switch -c fix/short-description
```

Use focused commits and stage explicit paths:

```powershell
git add README.md tests/test_example.py
git commit -m "docs: clarify local privacy model"
```

Do not commit directly to `master`.

## Required Validation

Run the checks relevant to the change.

Full Python suite:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

Exam packs:

```powershell
python tools/validate-exam-packs.py --root user-content/exams
python tools/validate-exam-packs.py --root user-content/exams --check-manifest
```

Generated landing pages:

```powershell
python tools/generate-exam-pages.py
git diff --exit-code -- exams sitemap.xml
```

JavaScript:

```powershell
node --check service-worker.js
Get-ChildItem assets/js -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Browser smoke:

```powershell
python -m http.server 4173 --bind 127.0.0.1
npm run test:browser
```

## Code Expectations

### JavaScript

- Prefer DOM APIs and `textContent` for untrusted values.
- Validate URLs, class names, IDs, and filenames before use.
- Do not add inline event-handler attributes.
- Preserve local/offline behavior and existing storage migrations.
- Avoid duplicate initialization and event listeners.

### Python

- Keep the local server bound to loopback unless a user explicitly opts into
  broader access.
- Validate upload names, content type, size, and destination paths.
- Use standard-library parsers for JSON, ZIP, and filesystem operations.

### CSS and Accessibility

- Preserve keyboard navigation and visible focus states.
- Check light and dark themes.
- Respect `prefers-reduced-motion`.
- Use semantic landmarks and accessible labels.

## Exam Content

Public exam content must be original and based on public learning objectives or
documentation. Do not submit copied certification questions.

Each public pack requires:

- a safe folder ID;
- `dump.json`;
- `metadata.json`;
- `manifest.json`;
- registration in `user-content/exams/index.json`;
- provenance fields in `contentReview`;
- objective and module metadata appropriate to the pack.

Supported question types are:

- `STANDARD`
- `MULTI`
- `SEQUENCE`
- `DRAG_DROP_SELECT`
- `YES_NO_MATRIX`

When pack files change, regenerate manifests:

```powershell
python tools/validate-exam-packs.py --root user-content/exams --write-manifest
```

## Documentation

Public documentation should describe only behavior that exists in the public
repository. Internal roadmaps, commercial operations, reviews, metrics, and
private infrastructure details do not belong in public docs.

Update generated exam pages after changing public metadata or generator copy.

## Pull Requests

Use the pull request template and include:

- what changed and why;
- risk or compatibility considerations;
- exact validation commands and results;
- screenshots for visible UI changes;
- pack counts or manifest results for content changes.

Review the complete diff before pushing. Confirm that `.local/`, private pack
sources, local configuration, and personal data are absent.

## Reporting Security or Content Issues

Open an issue with the minimum information needed to reproduce the problem. Do
not attach:

- proprietary exam packs;
- credentials or tokens;
- buyer/order information;
- analytics exports;
- local paths containing personal information.

For question corrections, include the public exam ID, question ID, the proposed
change, and an authoritative public source.
