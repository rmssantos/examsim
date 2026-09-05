# Public local edition release dependency

This compatibility branch follows the AI-103 refresh and is not a production
cutover. CNAME, Pages workflows, existing Gumroad products, and production DNS
are deliberately unchanged.

Before publishing this branch:

1. Finish the existing AI-103 content PR review and retain its validated preview.
2. Deploy and validate hosted `/exams/<exam-id>/` pages for all eight online
   offers: ai103, ab620, sc300, dp700, az400, az305, saac03, az104. Those pages must
   show current conditions and pricing and lead to the new online products.
   Until those hosted pages replace the current generated landings, the stable
   links here can return to the same public page; do not release this transition
   independently.
3. Coordinate the Pages/custom-domain migration with the hosted site release.
   Keep this GitHub repository public and preserve a working downloadable local
   simulator. Determine its optional public-demo address before changing CNAME.
   Review canonical URLs, sitemap, redirects, PWA scope/cache, approved telemetry
   hostnames, and the old landing URLs at that time.
4. Preserve the historical AB-620 buyer's offline file/key and access to this
   standalone edition. Do not replace, revoke, or publish changes to historical
   merchant files or receipts as part of this public repository update.
5. Verify the released local download offline, imported/legacy packs, all eight
   stable online links, actual hosted checkout, and telemetry separation. New
   online products remain unpublished until the coordinated merchant cutover.

Rollback is a coordinated restoration of the prior host/domain and storefront;
keep the previous public deployment and private resource backups until the new
route and purchase checks pass. This document does not authorize the switch.
