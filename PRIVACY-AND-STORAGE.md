# Privacy and Data Storage — local edition

This document covers the final standalone simulator in this repository, frozen
on 8 September 2026. The separately maintained service at [examplar.app](https://examplar.app/)
has its [own privacy policy](https://examplar.app/privacy-and-storage).

## No telemetry

This edition has no analytics or telemetry client, ingestion configuration,
tracking hooks, campaign attribution storage, or ad-click forwarding. That is
true on localhost, file URLs, and HTTPS self-hosted origins, including former
public hostnames. There is no analytics setting to opt out of.

The local progress dashboard, attempt review, missed-question study actions,
and Study Mode statistics still work. They are calculated and stored on the
device, and are not sent as events. Historical commits, old downloads, and
previously installed versions retain their original behavior; update the app
files and reload so its service worker can replace old cached assets.

## Browser storage and backups

- **IndexedDB:** imported packs, images, progress, recent attempt review, and
  Study Mode records.
- **localStorage:** theme, activation settings, exam visibility, and legacy
  compatibility records.
- **sessionStorage:** short-lived local navigation and study selections.
- **Cache Storage:** application files and previously loaded content for offline use.

Questions, selected answers, imported files, images, progress, attempt review,
and editor changes stay in your browser profile unless you export and share
an archive or use the editor's explicit local image upload described below.
Browser storage is isolated by origin and profile. Clearing site data, switching
ports or browsers, and some private browsing modes can lose access to that data.
Use progress and content exports for backups before making those changes.
Legacy analytics preferences left by an old version are unused; the final
edition does not read or forward them.

## Network requests and external links

A local server supplies static app files and bundled packs. The app can fetch
pack resources and images, including external images referenced by imported
content. Vendored libraries and fonts do not need a runtime CDN.

Following study resources, GitHub links, or **View complete exam online** opens
the selected destination. The browser sends normal web requests and may send
referrer information according to its policy. This edition does not append
campaign identifiers, ad-click identifiers, emails, licence keys, answers, or
local storage to those links. The external operator's privacy policy applies.
A self-hosted web server may maintain ordinary access logs; those are controlled
by its operator, not by this simulator.

## Local server and imports

Run `python server.py` and open `http://localhost:8000`. The server binds to
loopback by default. The editor's explicit local image upload endpoint validates image
content, names, and size, then writes to
`user-content/exams/<exam-id>/images/`. It does not upload question dumps.
Normal JSON/ZIP imports and editor changes stay in browser storage.

A self-hosted server can pre-install authorized packs. Those static files are
visible to its users; each user's progress and private imports stay in their
own browser profile. Only redistribute material you have permission to share.

## Offline use and previous purchases

After the app shell and selected content are cached, those assets can be used
offline. Content and external resources not cached first may need a connection.
Service workers require localhost or HTTPS. Direct `file://` use has browser
limitations; in particular, ZIP import requires the supported local server.

Previous offline purchases remain importable with their original file and
pack decryption key. New personal online licences do not decrypt local packs,
and new online purchases do not include an offline download. Accounts, online
licences, and checkout are handled by the separate service and its providers.

## Frozen source and forks

The repository remains downloadable with its history and existing licence.
Browser edits do not change the shared source. Export your changes for personal
use or maintain your own fork. Fork maintainers and self-hosters are responsible
for any changed networking, logging, privacy notice, or deployment settings.
