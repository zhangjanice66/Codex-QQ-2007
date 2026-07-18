#!/bin/bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

STATUS=""
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --status) STATUS="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) printf 'Usage: set-codex-1907-status-macos.sh --status <online|busy|offline> [--no-apply]\n' >&2; exit 1 ;;
  esac
done
ARGS=(--status "$STATUS")
if [ "$APPLY_NOW" = "false" ]; then ARGS+=(--no-apply); fi
"$SCRIPT_DIR/personalize-codex-2007-macos.sh" "${ARGS[@]}"
printf 'Codex 2007 status updated: %s\n' "$STATUS"
