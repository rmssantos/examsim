# Copilot Review Instructions

This repository is a static, offline-first exam simulator built with vanilla HTML, CSS, JavaScript, and a small local Python HTTP server.

When reviewing pull requests:

- Treat all exam dumps, metadata, localStorage, IndexedDB data, imported ZIP/JSON files, query strings, and uploaded filenames as untrusted input.
- Flag DOM XSS risks, especially `innerHTML`, template strings inserted into the DOM, unsafe URLs, unsafe icon/class interpolation, and event-handler attributes.
- Prefer DOM APIs such as `createElement`, `textContent`, `setAttribute` with validation, and allowlisted class names for user-controlled content.
- Preserve the offline-first behavior. Do not introduce new external CDN/runtime dependencies unless there is a clear security reason and the dependency is pinned or vendored locally.
- Check local file upload paths in `server.py` for path traversal, response splitting, unsafe CORS, excessive payload size, and broad network binding.
- Keep changes minimal and consistent with the existing no-build, browser-native architecture.
- Pay attention to question schema compatibility: `STANDARD`, `MULTI`, `YES_NO_MATRIX`, `SEQUENCE`, and `DRAG_DROP_SELECT` must remain supported.
- For PRs that touch exam navigation, bootstrap, or keyboard handlers, check for duplicate event listeners and repeated initialization.
- For PRs that touch storage, confirm data remains local to the browser unless the user explicitly opts into export/import.
- Write concise review comments in Portuguese when practical.
