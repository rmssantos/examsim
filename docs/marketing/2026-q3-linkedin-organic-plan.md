---
status: draft
created: 2026-07-30
channel: linkedin
campaign_window: 2026-08-04/2026-09-24
owner_review_required: true
---

# Examplar Q3 2026 LinkedIn organic plan

This is a drafting and measurement contract for an eight-week organic campaign.
Nothing in this directory is approved for publishing or scheduling. Every post
requires a final human check of its facts, links, timing, and tone.

## Objective

Use source-led educational content to learn which certification topics create
meaningful study intent before producing another question pack. The campaign
does not use paid ads. Its primary success signal is progression from a tracked
LinkedIn deep link to a configured practice session and first answered question,
not impressions alone.

## Audience and voice

- Language: English, matching the existing LinkedIn posts.
- Audience: cloud, security, data, and AI practitioners choosing or preparing
  for a certification.
- Voice: first person, technically specific, calm, and transparent about what
  Examplar does and does not offer.
- Format: a strong first two lines, short paragraphs, scannable bullets where
  useful, and three to four relevant hashtags.
- Claims: use current Microsoft documentation for certification facts and
  public repository evidence for Examplar facts. A personal result is labelled
  as personal evidence, never as a customer outcome.
- Prohibited: invented testimonials, copied certification questions, claims
  that Examplar contains official exam material, guaranteed outcomes, or a pack
  announcement before the pack exists.

## Tracking contract

Every published post would contain exactly one call to action and one direct
HTTPS Examplar destination. Informational source links are citations, not
additional calls to action.

| Parameter | Contract | Example |
| --- | --- | --- |
| `ref` | Unique post key: `li-pNN` | `li-p01` |
| `utm_source` | Always `linkedin` | `linkedin` |
| `utm_medium` | Always `organic` | `organic` |
| `utm_campaign` | Lowercase campaign family | `q3-2026-objective-refresh` |
| `utm_content` | Unique `pNN-topic-slug` | `p01-sc900-july-update` |

All values use only letters, numbers, dots, underscores, or hyphens and remain
under 80 characters, matching the bounded attribution contract in
`assets/js/analytics.js`. Do not add names, email addresses, LinkedIn activity
URNs, or free-form audience labels to tracking values.

Campaign families:

- `q3-2026-objective-refresh`: verified objective and content changes.
- `q3-2026-exam-choice`: role and exam comparisons.
- `q3-2026-editorial-method`: how the question bank is maintained.
- `q3-2026-role-roadmaps`: learning sequences by role.
- `q3-2026-build-notes`: transparent product and campaign learnings.
- `q3-2026-practice`: direct invitations to a diagnostic or catalog.

## Content mix

The rolling target is the 40/25/25/10 model:

- 40% educational;
- 25% inspirational;
- 25% conversational;
- 10% promotional.

Sixteen indivisible slots cannot reproduce those percentages exactly. This
calendar uses the nearest balanced allocation: six educational, four
inspirational, four conversational, and two promotional posts
(37.5/25/25/12.5). Carrying two educational, one inspirational, and one
conversational post into the next cycle produces an exact 8/5/5/2 split over
20 posts.

## Eight-week calendar

Suggested windows are Tuesday and Thursday at 08:30 Europe/Lisbon. Timing is a
starting hypothesis, not a platform guarantee. Posts 01–08 have complete draft
copy. Posts 09–16 are briefs only and must not be published without their own
source review and draft file.

| Week | Date | ID | Pillar | Topic | Destination | Campaign / ref | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-08-04 | P01 | Educational | SC-900 July objective update | `/exams/sc900/` | `q3-2026-objective-refresh` / `li-p01` | draft |
| 1 | 2026-08-06 | P02 | Educational | One sourced AI-103 practice item | `/exams/ai103/` | `q3-2026-practice` / `li-p02` | draft |
| 2 | 2026-08-11 | P03 | Educational | AI-103 compared with AB-620 | `/exams/ai103/` | `q3-2026-exam-choice` / `li-p03` | draft |
| 2 | 2026-08-13 | P04 | Educational | AZ-500 transition to SC-500 | `/exams/` | `q3-2026-exam-choice` / `li-p04` | draft |
| 3 | 2026-08-18 | P05 | Conversational | Examplar editorial method | `/exams/` | `q3-2026-editorial-method` / `li-p05` | draft |
| 3 | 2026-08-20 | P06 | Inspirational | AI Engineer learning roadmap | `/roadmaps.html` | `q3-2026-role-roadmaps` / `li-p06` | draft |
| 4 | 2026-08-25 | P07 | Inspirational | Personal AB-731 proof | `/exams/ab731/` | `q3-2026-build-notes` / `li-p07` | draft |
| 4 | 2026-08-27 | P08 | Promotional | Build-in-public results and catalog | `/exams/` | `q3-2026-build-notes` / `li-p08` | draft |
| 5 | 2026-09-01 | P09 | Educational | Why explanations matter more than a score | `/exams/` | `q3-2026-editorial-method` / `li-p09` | brief only |
| 5 | 2026-09-03 | P10 | Educational | How a local-first study session works | `/privacy-and-storage.html` | `q3-2026-editorial-method` / `li-p10` | brief only |
| 6 | 2026-09-08 | P11 | Inspirational | A Data Engineer path from DP-900 to DP-700 | `/roadmaps.html` | `q3-2026-role-roadmaps` / `li-p11` | brief only |
| 6 | 2026-09-10 | P12 | Inspirational | From a missed answer to weak-area practice | `/exams/` | `q3-2026-build-notes` / `li-p12` | brief only |
| 7 | 2026-09-15 | P13 | Conversational | Demand check: SC-500 or AB-620 | `/exams/` | `q3-2026-exam-choice` / `li-p13` | brief only |
| 7 | 2026-09-17 | P14 | Conversational | What should remain browser-only? | `/privacy-and-storage.html` | `q3-2026-build-notes` / `li-p14` | brief only |
| 8 | 2026-09-22 | P15 | Conversational | Which objective update changed your plan? | `/exams/` | `q3-2026-objective-refresh` / `li-p15` | brief only |
| 8 | 2026-09-24 | P16 | Promotional | Ten-question diagnostic invitation | `/exams/` | `q3-2026-practice` / `li-p16` | brief only |

## Measurement and decisions

Capture a manual snapshot at 48 hours and seven days after each post:

- LinkedIn: impressions, members reached, reactions, comments, reposts, saves,
  and link engagements.
- Examplar: landing CTA events, configured sessions, first answers, and
  completions grouped by campaign, content, and exam.
- Interpretation: the local dashboard reports event ratios, not unique-user
  conversion rates. Do not describe them as people or leads.

At the end of week four:

1. Rank posts by link engagements and first-answer events.
2. Compare themes, not isolated impression totals.
3. Keep the two strongest formats and revise weak hooks or destinations.

At the end of week eight:

1. Continue a theme when it repeatedly produces above-median deep-link and
   first-answer activity.
2. Consider a new pack only when one exam shows at least two independent demand
   signals, such as repeated tracked study intent plus public comments or direct
   requests.
3. Do not infer demand from reactions alone and do not start paid acquisition
   until the landing-to-first-answer path is working organically.

## Public-repository safety

- Commit only these prepared drafts and public source links.
- Do not commit raw LinkedIn exports, screenshots, member data, messages,
  analytics query output, aggregate post analytics, or `.local` paths.
- P08 describes the experiment without disclosing the private baseline. Add
  aggregate results only after explicit approval for public disclosure.
- Keep every draft marked `status: draft`; publishing is a separate,
  explicitly authorized action.

## Pre-publish checklist

- [ ] Microsoft claims rechecked against the English source on publish day.
- [ ] Examplar destination returns HTTP 200 and represents the copy accurately.
- [ ] Exactly one call to action and one tracked Examplar deep link.
- [ ] `ref`, campaign, and content values match the calendar.
- [ ] No private analytics, identifiers, testimonials, or unsupported outcome claims.
- [ ] No claim that a planned SC-500 or AB-620 pack already exists.
- [ ] Copy proofread in LinkedIn preview on desktop and mobile.
- [ ] Status changed only in the publishing system, not silently in this repository.

## Draft files

1. [`01-sc900-july-objective-update.md`](linkedin-posts/01-sc900-july-objective-update.md)
2. [`02-ai103-sourced-practice-item.md`](linkedin-posts/02-ai103-sourced-practice-item.md)
3. [`03-ai103-vs-ab620.md`](linkedin-posts/03-ai103-vs-ab620.md)
4. [`04-az500-to-sc500.md`](linkedin-posts/04-az500-to-sc500.md)
5. [`05-editorial-method.md`](linkedin-posts/05-editorial-method.md)
6. [`06-ai-engineer-roadmap.md`](linkedin-posts/06-ai-engineer-roadmap.md)
7. [`07-ab731-personal-proof.md`](linkedin-posts/07-ab731-personal-proof.md)
8. [`08-build-in-public-results.md`](linkedin-posts/08-build-in-public-results.md)
