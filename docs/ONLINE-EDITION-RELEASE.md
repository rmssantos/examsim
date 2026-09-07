# Local and online editions after the transition

The repository is the final local edition, frozen on 8 September 2026. Its
existing history and licence remain available for downloads and forks. Ongoing
hosted development is maintained separately in a private repository.

## Download and run locally

Use the repository's **Code → Download ZIP**, extract it, and run
`python server.py` inside the extracted folder. Open `http://localhost:8000`.
The source download includes the local image-upload endpoint. No Node install
or build step is required to use the app.

The optional command `python tools/build_pages_artifact.py --output _site`
creates an allowlisted static distribution for a fork's own server. That output
does not include `server.py` or its upload endpoint. The full source download is
the recommended local distribution.

## Boundaries

- Free packs, local progress and statistics, editor, JSON/ZIP imports, and
  previous offline activation remain available without an account.
- The final edition contains no analytics, tracking hooks, ingestion target,
  campaign storage, or ad-click forwarding, on any hostname. Earlier history
  and old downloads retain their original behavior.
- Complete-exam links deliberately open `https://examplar.app/exams/<id>/`.
  Current hosted offers, prices, content, accounts, and personal licences are
  controlled by that separate service. They do not activate local packs.
- GitHub Pages is retired. There is no Pages deployment workflow or CNAME in
  this repository. Validation builds and tests the static artifact only.
- The local edition's browser storage is independent of hosted accounts.
  Export progress and imports before clearing storage or changing origins.
- The source and content are a frozen snapshot, not a promise of current exam
  coverage. Fork maintainers own their updates and deployment configuration.

See [the local privacy disclosure](../PRIVACY-AND-STORAGE.md),
[README](../README.md), and [the pack format](Pack-Format.md).
