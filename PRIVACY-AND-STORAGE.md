# Privacy and Data Storage

This document describes the data behavior of Examplar's public deployment and
local/self-hosted use.

## Summary

Exam content, selected answers, imported files, images, progress, attempt review
records, Study Mode data, and editor changes remain in the user's browser
storage.

The public deployment sends limited product telemetry to Azure Application
Insights. Analytics can be disabled from the Privacy settings control.

Analytics is not initialized on `localhost`, `127.0.0.1`, private self-hosted
URLs, or `file://` URLs.

## Browser Storage

Examplar uses:

- IndexedDB for imported packs, images, progress, and recent attempt review
  records;
- localStorage for small settings, analytics opt-out, activation state, and
  legacy compatibility;
- Cache Storage for app files needed for offline access.

Browser storage is isolated by site origin and browser profile. Clearing site
data can remove imports and progress. Use the export actions when a backup is
needed.

## Public-Site Telemetry

The public deployment can collect:

- page views;
- exam and Study Mode start/completion events;
- attempt review and missed-question study actions;
- import success/failure and coarse file size/type buckets;
- progress and editor import/export actions;
- unlock, pro modal, purchase-link, and import-activation counts;
- pass/fail, coarse score and duration buckets;
- sanitized `ref`, `utm_source`, `utm_medium`, and `utm_campaign` labels;
- external referrer hostname without the full URL or path.

Bundled exam labels are restricted to `ab730`, `ab731`, `sc900`, `az900`,
`az104`, `saac03`, `clfc02`, `ai901`, `az305`, and `az400`. Other exam IDs are reported only as `imported`.

Azure Application Insights temporarily uses the sender IP to derive coarse
country, region, and city information. Under the configured default behavior,
the full IP address is not stored. Azure can also attach browser, operating
system, device type, and device model metadata.

Authorized maintainers can inspect event timestamps and this coarse metadata for
operational analysis. The analytics workspace is configured with 30-day
retention.

## Data Not Collected

Examplar telemetry does not intentionally collect:

- names, emails, account identifiers, or a custom persistent visitor ID;
- question text, options, answers, explanations, or selected responses;
- imported content, ZIP contents, filenames, or browser-storage exports;
- question IDs, per-question Study Mode records, due dates, or attempt details;
- full referrer URLs, paths, or arbitrary query parameters;
- license keys or payment details.

Sanitizers discard campaign values resembling emails, URLs, or paths.

## Analytics Choice

The public site initializes analytics by default. Use the Privacy settings
control to opt out. The preference is stored in:

```text
localStorage['exam_analytics_opt_out'] = 'true'
```

Changing or clearing browser storage can reset that preference.

## Local and Self-Hosted Use

Local and private self-hosted URLs do not initialize the public analytics
client.

Running `python server.py` exposes a same-origin local image upload endpoint used
by the editor. The endpoint accepts image files only, validates names and
content, enforces the configured size limit, and writes into
`user-content/exams/<exam-id>/images/`. It does not receive or persist exam
dumps.

A self-hosted server can pre-install public or authorized exam packs. Those
static files are visible to users of that deployment, while each user's progress
and private imports remain in that user's browser profile.

## Offline Behavior

After the application shell is cached, installed pages and assets can be used
without a network connection. Content not previously cached may still require a
connection.

## Publishing Corrections

Edits made in the browser affect only that browser profile. To publish a
correction for everyone:

1. export the corrected content;
2. remove private or proprietary material;
3. open a pull request or GitHub issue.

## Deployment Responsibilities

Self-hosters are responsible for their own privacy notice, consent model,
retention, processor agreements, and legal obligations. Configuration may
change the behavior described here.
