# Public-Only Repository Plan

Goal: provide a distributable version of Exam Simulator Pro that showcases the UI/UX without bundling private exam dumps, licensed images, or other internal-only assets.

## 1. Repository Scope

- **Include**: static front-end (`index.html`, CSS, JS), editor tooling, placeholder data, documentation, and lightweight sample dumps from `exam-dumps/`.
- **Exclude**: everything under `user-content/`, `images/uploads/`, locally generated ZIPs, and any proprietary JSON metadata.
- **Optional**: keep `docs/` (including this plan) and `exam-dumps/README.md` to guide contributors.

## 2. Sanitization Checklist

1. Delete `user-content/` directory or replace with empty scaffold + README describing how to import private packs.
2. Scrub `images/uploads/` and `images/ai102/` folders; keep only generic placeholders or abstract illustrations.
3. Verify `.gitignore` blocks any regenerated dumps (`*.zip`, `*.json`) outside `exam-dumps/`.
4. Run the simulator with sample data (`exam-dumps/high5_dump.json`, etc.) to confirm UI remains functional.
5. Update documentation to reference sample packs instead of real exams.

## 3. Proposed Folder Structure

```
public-repo/
├── README.md (public instructions)
├── docs/
│   ├── public-repo-plan.md (this file)
│   └── compliance-summary.md (sanitized version without internal hashes)
├── exam-dumps/
│   ├── README.md (usage instructions)
│   └── sample_exam.json (non-sensitive example)
├── images/
│   └── placeholders/ (generic artwork free to share)
├── scripts/ (optional helpers like generate-exam-data-js.py stripped of private paths)
├── src/ (HTML, CSS, JS)
└── LICENSE
```

## 4. Migration Steps

1. **Create new branch or repo** named `exam-simulator-public`.
2. Copy only safe directories/files based on the scope above.
3. Run `git status` to ensure no `user-content` or uploads remain.
4. Update README to explain how to import private dumps locally after cloning.
5. Add a "Getting Started" section that links to sample data and highlights compliance boundaries.
6. Tag release `v1-public-preview` once validated.

## 5. Tooling Suggestions

- Add a pre-commit hook (PowerShell/Bash) that fails if `user-content/` exists or if files over a size threshold are staged.
- Provide a PowerShell script `scripts/prepare-public.ps1` that copies only approved directories into a `dist/public` folder.
- Consider GitHub Actions workflow to lint HTML/CSS and verify that forbidden paths are absent.

## 6. Communication

- Document the policy in `PRIVACY-AND-STORAGE.md` referencing this plan.
- When sharing with external collaborators, link directly to the public repo plus a short FAQ covering why real dumps are excluded.
