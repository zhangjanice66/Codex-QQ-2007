---
name: codex-qq-2007-macos
description: Install, personalize, launch, verify, repair, update, or restore the Codex QQ2007 deep-replica skin on macOS while preserving native Codex behavior.
compatibility: macOS, official Codex Desktop app, signed bundled Node.js 20 or newer
---

# Codex QQ 2007 for macOS

This file is an optional Codex capability entry. The delivery is a complete standalone project; users do not need to install it as a Skill.

## Workflow

1. Run `Install Codex Dream Skin.command` from the complete `macos/` folder.
2. Switch to `preset-codex-1907-deep` and start the installed engine.
3. Use the toolbar skin button to switch between the deep replica and original Codex.
4. Verify the live result with `Verify Codex Dream Skin.command`.
5. Restore the official appearance with `Restore Codex Dream Skin.command`.

## Guardrails

- Never modify the official `.app`, `app.asar`, or its code signature.
- Use the official Codex app's signed Node.js runtime only after validating its signature, Team ID, architecture, and minimum version.
- Bind CDP to loopback, verify that the listener belongs to Codex, and reject non-Codex renderer targets.
- Preserve all native cards, navigation, project selectors, task content, composer controls, and keyboard focus.
- Preserve native project, task, message, Diff, approval, reasoning, tool-call, and composer structures.
- Keep decoration at `pointer-events: none`.
- Require explicit authorization before restarting an already-running Codex instance.
- Stop an injector only when its recorded PID, executable, command line, and start time all match.

## Key resources

- `../README.md`: repository overview and installation guide.
- `../docs/CODEX-1907.md`: skin switching and personalization guide.
- `scripts/injector.mjs`: CDP connection, injection, removal, verification, and screenshots.
- `assets/dream-skin.css`: live native interface styling.
- `assets/renderer-inject.js`: idempotent DOM integration and cleanup.
- `scripts/doctor-macos.sh`: signed-runtime, payload, and optional live-session self-check.
- `scripts/codex-2007-acceptance-plan.mjs`: responsive release acceptance contract.
