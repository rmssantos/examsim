# Examplar

Examplar is a local-first, offline-capable certification exam simulator built
with vanilla HTML, CSS, JavaScript, and a small optional Python server.

[Open Examplar](https://examplar.app) |
[Browse practice exams](https://examplar.app/exams/) |
[Privacy and storage](PRIVACY-AND-STORAGE.md)

## What It Provides

- Timed exam sessions with configurable pass scores
- Standard, multi-select, sequence, drag-select, and Yes/No matrix questions
- Study Mode with spaced repetition and weak-area practice
- Attempt history, detailed review, and progress export
- JSON and ZIP pack import
- A browser-based question editor
- Local image support
- Light and dark themes
- Installable PWA behavior and offline access after the app is cached

No account is required.

## Privacy Model

Questions, selected answers, imported content, images, progress, and editor
changes remain in browser storage.

The public deployment at `examplar.app` sends limited product telemetry to Azure
Application Insights. This includes page views, coarse usage events, campaign
labels, referrer hostname, and Azure-derived coarse client/location metadata.
Analytics can be disabled from the Privacy settings control.

Analytics is not initialized on `localhost`, private self-hosted URLs, or
`file://` URLs.

See [PRIVACY-AND-STORAGE.md](PRIVACY-AND-STORAGE.md) for the complete disclosure.

## Quick Start

### Public Site

Open [examplar.app](https://examplar.app), select an exam, and start practicing.
After the app shell is cached, previously installed pages and assets remain
available offline.

### Local Server

```powershell
git clone https://github.com/rmssantos/examsim.git
cd examsim
python server.py
```

Open `http://localhost:8000`.

The local server enables automatic pack discovery and the editor's local image
upload endpoint. It binds to the loopback interface by default.

### Direct File Use

Opening `index.html` directly can work for basic use, but browser security rules
limit automatic folder discovery and some image workflows. Use `python server.py`
for the supported local development experience.

## Exam Packs

Public packs live under:

```text
user-content/exams/<exam-id>/
|-- dump.json
|-- metadata.json
|-- manifest.json
`-- images/
```

Users can also import:

- a JSON question array;
- a combined JSON object containing `id`, `metadata`, and `questions`;
- a ZIP containing `dump.json`, optional `metadata.json`, and optional images.

Imported packs and their progress are stored in that browser profile. They are
not uploaded to the public repository or server.

Detailed formats:

- [Exam import guide](user-content/README-IMPORT.md)
- [Question and metadata schema](docs/Data-and-Dumps.md)
- [Pack distribution guide](docs/HOW-TO-DISTRIBUTE.md)

## Built-In Editor

Open `editor.html` to create or edit a pack.

The editor can:

- add and update supported question types;
- edit pack metadata;
- import and export JSON;
- preview questions;
- copy image files into a local pack when running through `server.py`.

Browser edits affect only the current browser. To publish a correction, export
the updated content and submit a pull request or GitHub issue.

## Repository Layout

```text
.
|-- index.html                 Homepage and exam library
|-- exam.html                  Exam and Study Mode runtime
|-- editor.html                Question editor
|-- privacy-and-storage.html   User-facing privacy page
|-- server.py                  Optional local HTTP server
|-- assets/                    CSS, JavaScript, media, and vendored dependencies
|-- exams/                     Generated SEO landing pages
|-- tools/                     Generators, validators, and pack utilities
|-- tests/                     Python and browser regression tests
|-- docs/                      Public technical documentation
`-- user-content/exams/        Intentionally published exam packs
```

## Content Policy

This repository contains original educational practice content. It must not
contain:

- copied live exam questions or official exam dumps;
- proprietary packs without redistribution rights;
- private paid-pack sources or delivery artifacts;
- license keys, buyer data, analytics exports, or internal commercial records;
- personal browser data or local development notes.

Local/private material belongs outside Git history. The repository ignores
`.local/` for that purpose.

Examplar is not affiliated with or endorsed by Microsoft, Amazon Web Services,
or other certification vendors. Certification names and trademarks belong to
their respective owners.

## Development

Requirements:

- Python 3.10 or newer
- Node.js 22 or newer

Install browser test dependencies:

```powershell
npm ci
```

Run validation:

```powershell
python tools/validate-exam-packs.py --root user-content/exams
python tools/validate-exam-packs.py --root user-content/exams --check-manifest
python -m unittest discover -s tests -p "test_*.py"
node --check service-worker.js
```

Run the browser smoke test with a local static server:

```powershell
python -m http.server 4173 --bind 127.0.0.1
npm run test:browser
```

Generated exam pages must stay synchronized with metadata:

```powershell
python tools/generate-exam-pages.py
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Treat imported JSON, ZIP files, metadata, filenames, URLs, and browser storage
as untrusted input. Security issues should be reported without attaching
proprietary packs, credentials, or personal data.

Production response-header guidance is documented in
[docs/SECURITY-HEADERS.md](docs/SECURITY-HEADERS.md).

## License

The simulator source is available under the [MIT License](LICENSE). Exam content
and third-party assets may have separate terms; verify redistribution rights
before publishing them.
