# Troubleshooting

First question blank or counter flash 1/50
- Ensure exam.html defers start until AI‑102 is ready (ai102QuestionsReady) or data is already present.
- Confirm `exam-loader.js` finishes before `script-multi-exam.js` so question banks exist.

Only 5 AI‑102 questions
- Verify ai102_dump.js/json are present under portable/dumps
- Ensure editor and exam load dumps before any loader or fallback

Results visible during exam
- #results-screen must be display:none by default; it's shown only after finish
- Confirm no CSS overrides leak visibility

Custom exam not loading
- Check localStorage key name: custom_<code>_questions
- For file-based, ensure exam-dumps/<code>.json exists and is a valid array
- Launch with exam.html?exam=custom&code=<code>

High contrast answer colors missing
- Confirm portable/multi-exam-styles.css is included and not overridden by theme

Data mismatch or duplicates
- Clear localStorage to remove stale overrides
- Rebuild dumps; AI‑102 transform de-duplicates IDs and normalizes types
