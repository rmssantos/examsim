# Public local edition and hosted-service cutover

The public repository remains the standalone simulator. Free packs, the editor,
local imports, previous offline activation and browser-local progress remain
available without an account. Complete-exam links use the stable official
`https://examplar.app/exams/<exam-id>/` pages; prices and checkout destinations
belong to the separately deployed online service.

PR #108 and AI-103 PR #118 are already integrated into `master`. Compatibility
PR #119 is integrated into `release/online-transition`. The coordinated release
also removes this repository's `CNAME` and GitHub Pages deployment workflow.
Validation still builds and browser-tests the allowlisted static distribution;
`python tools/build_pages_artifact.py --output _site` remains available for local
use or self-hosting on a separately configured domain.

## Coordinated release order

1. Complete the hosted application's code, security and migration checks. Keep
   the prior public deployment, GitHub Pages settings and domain routing details
   available for rollback.
2. Prepare and validate all eight hosted exam pages: ai103, ab620, sc300, dp700,
   az400, az305, saac03 and az104. Verify the correct new online products,
   individual licences, current prices, campaigns and activation instructions.
3. Disable this repository's existing Pages deployment workflow, reconcile its
   Pages custom-domain assignment and move the official domain to the validated
   hosted service. Preserve unrelated DNS and mail configuration. Do not dispatch
   the old workflow during or after the switch.
4. Once the new domain route serves the reviewed application, verify HTTPS,
   canonical URLs, sitemap, existing landing URLs, redirects, analytics consent
   and the upgrade from previously installed PWAs. Keep imported content and
   progress intact. Open online sales only when purchases can be fulfilled.
5. Merge the checked `release/online-transition` branch into `master` as part of
   that same coordinated cutover. Confirm that the Pages workflow and `CNAME`
   are absent and that later public pushes cannot replace the official service.
6. Verify a fresh local download, free practice, imports and previous offline
   activation, plus all eight stable links to the official online catalogue.

Historical buyers keep their existing merchant files, receipts, keys and local
simulator access. This public release does not replace or revoke that delivery.
New personal online licences require the hosted account and internet connection;
they cannot decrypt old offline packs.

Rollback must coordinate the application, domain and storefront. Close new
checkout first if fulfilment is unavailable and preserve any purchases already
made. Do not automatically republish an old Pages artifact or restore a database
backup over newer buyer records. Restore only a compatible, deliberately reviewed
combination of routing and application state.
