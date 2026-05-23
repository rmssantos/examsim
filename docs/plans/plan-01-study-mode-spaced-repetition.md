# Plan 1: Study Mode and Spaced Repetition

## Goal

Add a study mode that creates a daily review loop from local per-question performance data, without sending study data to any server.

## Implementation Status

First browser-native version implemented:

- Study Mode URL support through `exam.html?exam=<id>&mode=study`.
- Local IndexedDB per-question stats via `assets/js/study-storage.js`.
- Due/new/weak prioritization via `assets/js/study-scheduler.js`.
- Homepage Study actions and due/weak counts.
- Study completion report that does not write exam-attempt progress.
- Privacy-conscious aggregate analytics for Study Mode usage.

Follow-ups intentionally left for later:

- Export/import of study stats.
- Manual grading controls such as Again/Hard/Good.
- A dedicated weakest-questions dashboard beyond the current weak-count queue priority.

## Current State

- The simulator already records exam attempts and aggregate progress in `localStorage`.
- The homepage and results screens show attempt-level performance.
- There is no per-question study history.
- There is no due-today workflow or spaced repetition scheduler.
- Imported images already use IndexedDB, but questions and progress mostly still use `localStorage`.

## Product Shape

Add a "Study Mode" alongside the existing exam mode.

Study Mode should:

- Present one question at a time.
- Give immediate feedback after answering.
- Track per-question strength.
- Schedule the next review date.
- Prioritize due and weak questions.
- Stay entirely client-side.

## Data Model

Store per-question stats in IndexedDB. The key should be stable across sessions:

```text
studyStats_<examId>_<questionId>
```

Suggested record:

```json
{
  "examId": "sc900",
  "questionId": "sc900-q001",
  "seenCount": 3,
  "correctCount": 2,
  "lastSeen": "2026-05-23T10:30:00.000Z",
  "nextDue": "2026-05-25T10:30:00.000Z",
  "easeFactor": 2.5,
  "lastResult": "correct"
}
```

Use a simplified SM-2-style scheduler:

- Incorrect answer: review soon, reduce ease.
- Correct but hesitant/first-time answer: short interval.
- Repeated correct answers: increase interval.
- Clamp ease and intervals to avoid extreme dates.

## UI Changes

Homepage:

- Add a "Study" action for each exam card or details panel.
- Add a compact "Due today" count when study stats exist.
- Add a "Weakest questions" entry point after enough answers exist.

Study screen:

- Reuse the existing question rendering as much as possible.
- Hide timer and exam pass/fail concepts.
- Show immediate feedback after each answer.
- Add actions such as "Again", "Hard", "Good" if manual grading is introduced later.
- Start with automatic grading from existing question correctness.

Results/dashboard:

- Show due today count.
- Show weakest questions based on accuracy and recency.
- Keep export/import explicit and local.

## Implementation Steps

1. Add a small IndexedDB wrapper for study stats, preferably separate from image storage.
2. Add scheduler helpers with unit-testable pure functions where practical.
3. Add URL mode support, for example `exam.html?exam=sc900&mode=study`, or a separate `study.html` if the shared screen becomes too complex.
4. Reuse existing question renderers from `assets/js/script-multi-exam.js` where possible.
5. Save stats after each answered question.
6. Add homepage counts for due and weak questions.
7. Add export/import support for study stats in the progress export flow.
8. Update privacy/storage documentation.

## Suggested Files

- `assets/js/study-storage.js`
- `assets/js/study-scheduler.js`
- `assets/js/script-multi-exam.js`
- `assets/js/homepage.js`
- `assets/css/exam-enhancements.css`
- `assets/css/homepage-styles.css`
- `PRIVACY-AND-STORAGE.md`
- `README.md`

## Acceptance Criteria

- A user can start Study Mode for any loaded exam.
- Study Mode asks due/weak questions before new questions.
- Per-question stats persist across browser sessions.
- Study data remains local to the browser unless explicitly exported.
- Existing Exam Mode behavior remains unchanged.
- All supported question types remain answerable in Study Mode.

## Risks

- Question IDs must be stable; imported packs with missing or duplicate IDs should be rejected or normalized before stats are saved.
- Moving too much logic out of `script-multi-exam.js` can become a refactor. Keep the first version narrowly scoped.
- Study stats should not bloat `localStorage`; use IndexedDB from the start.

## Out of Scope

- Cloud sync.
- User accounts.
- Marketplace integration.
- Public demo pack.
