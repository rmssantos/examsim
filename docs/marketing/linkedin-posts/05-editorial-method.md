---
status: draft
post_id: p05
language: en
pillar: conversational
scheduled_window: 2026-08-18T08:30:00+01:00
campaign: q3-2026-editorial-method
ref: li-p05
utm_content: p05-source-backed-refresh
cta_count: 1
cta_url: "https://examplar.app/exams/?ref=li-p05&utm_source=linkedin&utm_medium=organic&utm_campaign=q3-2026-editorial-method&utm_content=p05-source-backed-refresh"
sources:
  - "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/sc-900"
  - "https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/ab-731"
local_evidence:
  - "docs/content/2026-07-30-objective-refresh-ledger.md"
---

# A review date needs a review trail

## Draft copy

A “last reviewed” date without a review trail is not very useful.

This is the method I now use when Microsoft changes a certification study guide:

1. Record the current English objective version and source URL.
2. Compare the objective names, weights, and terminology with the local pack.
3. Link each confirmed delta to the affected question IDs.
4. Change only what the source supports and preserve stable IDs where possible.
5. Regenerate integrity manifests and landing pages, then run pack tests.
6. Show the objective version and review date to the learner.

In the July review, that process covered SC-900, AB-730, AB-731, AZ-400, DP-900,
and DP-700. Some packs needed question changes. DP-900 needed metadata only.

That distinction matters: an update should not become an excuse to rewrite
content that is still correct.

Inspect the currently reviewed practice catalog:
https://examplar.app/exams/?ref=li-p05&utm_source=linkedin&utm_medium=organic&utm_campaign=q3-2026-editorial-method&utm_content=p05-source-backed-refresh

#ContentEngineering #MicrosoftLearn #ExamPreparation #OpenSource

## Editorial notes

- The six-pack scope and DP-900 metadata-only result are recorded in the public
  July 2026 ledger.
- “Currently reviewed” does not mean every pack was reviewed on the same date;
  landing pages expose pack-specific dates.
- Keep the public ledger path in front matter/editorial evidence rather than
  the post body so link engagements measure the Examplar destination.
