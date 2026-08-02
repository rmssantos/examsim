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
- sessionStorage for sanitized campaign attribution during the current browser
  tab only;
- Cache Storage for app files needed for offline access.

Browser storage is isolated by site origin and browser profile. Clearing site
data can remove imports and progress. Use the export actions when a backup is
needed.

## Public-Site Telemetry

The public deployment can collect:

- page views;
- exam start/completion events;
- Study Mode session starts, one first-answer interaction per Study session, and
  completion aggregates;
- attempt review and missed-question study actions;
- import success/failure and coarse file size/type buckets;
- progress and editor import/export actions;
- unlock, pro modal, purchase-link, and import-activation counts;
- results-screen upsell and pass-story link counts;
- generated landing-page CTA, configured session, and first-answer interaction
  counts;
- pass/fail, coarse score and duration buckets;
- sanitized `ref`, `utm_source`, `utm_medium`, `utm_campaign`, and `utm_content`
  labels;
- external referrer hostname without the full URL or path.

Campaign labels and the external referrer hostname are stored in sessionStorage
so they can be attached to later events in the same tab. A later URL with
explicit campaign parameters replaces the previous tab attribution. Only the
known fields above are retained; there is no visitor ID, campaign timestamp, or
cross-tab attribution record.

Bundled exam labels are restricted to `ab730`, `ab731`, `ab620`, `sc900`, `az900`,
`az104`, `saac03`, `clfc02`, `ai901`, `az305`, `az400`, `dp900`, `dp700`, `ai103`, and `sc300`. Other exam IDs are reported only as `imported`.

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
Study start and first-answer events contain only bounded exam/session context.
Study completion telemetry sends session-level question, answered, and correct counts plus coarse accuracy and duration buckets. These aggregates are not linked to question identifiers or content; however, results from very small Study sessions may be inferable. Examplar does not send individual answer events, question IDs or text, options, answer state, or selected responses.
The Study first-answer event is emitted once per Study session; exam
first-answer events are bounded interaction counts too.

## Analytics Choice

The public site initializes analytics by default. Use the Privacy settings
control to opt out. The preference is stored in:

```text
localStorage['exam_analytics_opt_out'] = 'true'
```

Opting out also clears campaign attribution from the current tab. Changing or
clearing browser storage can reset the persistent opt-out preference.

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
