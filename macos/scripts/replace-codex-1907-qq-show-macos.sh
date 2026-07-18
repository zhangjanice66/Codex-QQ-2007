#!/bin/bash

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

SOURCE=""
APPLY_NOW="true"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) SOURCE="${2:-}"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) printf 'Usage: replace-codex-1907-qq-show-macos.sh --file <image> [--no-apply]\n' >&2; exit 1 ;;
  esac
done

[ -n "$SOURCE" ] || { printf 'Choose an image with --file <image>.\n' >&2; exit 1; }
ARGS=(--qq-show "$SOURCE")
if [ "$APPLY_NOW" = "false" ]; then ARGS+=(--no-apply); fi
"$SCRIPT_DIR/personalize-codex-2007-macos.sh" "${ARGS[@]}"
printf 'QQ show updated for both Codex 2007 themes.\n'
