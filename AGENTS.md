# Repository Guidelines

- `macos/` is the product root. Do not add Windows runtime code to this repository.
- Run `cd macos && npm test` before publishing changes.
- For renderer or CSS changes, also run live verification on a real Codex task page.
- Never modify Codex.app, `app.asar`, its code signature, API keys, or Base URLs.
- Keep CDP loopback-only and preserve native sidebar, task, message, Diff, approval, and composer nodes.
- Update `macos/CHANGELOG.md` and bump `macos/VERSION` for release-worthy changes.
- Use two-space indentation. Shell entry points use `set -euo pipefail`; Node files use ESM.
- Do not commit private screenshots, credentials, local state, release ZIPs, or user-supplied artwork without redistribution rights.
