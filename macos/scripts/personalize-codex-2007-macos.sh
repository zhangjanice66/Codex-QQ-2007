#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

NICKNAME=""
SIGNATURE=""
LEVEL=""
STATUS=""
ASSISTANT=""
QQ_SHOW=""
APPLY_NOW="true"
HAS_CHANGE="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --nickname) NICKNAME="${2:-}"; [ -n "$NICKNAME" ] || fail "Nickname must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --signature) SIGNATURE="${2:-}"; [ -n "$SIGNATURE" ] || fail "Signature must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --level) LEVEL="${2:-}"; [ -n "$LEVEL" ] || fail "Level must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --status) STATUS="${2:-}"; [ -n "$STATUS" ] || fail "Status must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --assistant) ASSISTANT="${2:-}"; [ -n "$ASSISTANT" ] || fail "Assistant image path must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --qq-show) QQ_SHOW="${2:-}"; [ -n "$QQ_SHOW" ] || fail "QQ show image path must not be empty."; HAS_CHANGE="true"; shift 2 ;;
    --no-apply) APPLY_NOW="false"; shift ;;
    *) fail "Usage: personalize-codex-2007-macos.sh [--nickname text] [--signature text] [--level text] [--status online|busy|offline] [--assistant image] [--qq-show image] [--no-apply]" ;;
  esac
done
[ "$HAS_CHANGE" = "true" ] || fail "Choose at least one Codex 2007 personalization option."
if [ -n "$STATUS" ]; then
  case "$STATUS" in online|busy|offline) ;; *) fail "Status must be online, busy, or offline." ;; esac
fi

ensure_state_root
ensure_node_runtime
for id in preset-codex-1907-deep; do
  [ -f "$STATE_ROOT/themes/$id/theme.json" ] \
    || fail "Codex 2007 preset is missing: $id. Install or start Dream Skin once, then retry."
done

temporary_dir="$(/usr/bin/mktemp -d "$STATE_ROOT/.codex-2007-personalize.XXXXXX")"
cleanup() { /bin/rm -rf "$temporary_dir"; }
trap cleanup EXIT

prepare_image() {
  local source="$1"
  local output="$2"
  [ -f "$source" ] || fail "Personalization image not found: $source"
  [ ! -L "$source" ] || fail "Personalization image must not be a symbolic link."
  /usr/bin/sips -s format png "$source" --out "$output" >/dev/null \
    || fail "macOS could not convert this image to PNG."
  local bytes
  bytes="$(/usr/bin/stat -f '%z' "$output")"
  [ "$bytes" -gt 0 ] && [ "$bytes" -le 16777216 ] \
    || fail "Personalization image must be non-empty and no larger than 16 MB."
}

NODE_ARGS=("$SCRIPT_DIR/codex-2007-personalization.mjs" --themes-root "$STATE_ROOT/themes")
if [ -n "$NICKNAME" ]; then NODE_ARGS+=(--nickname "$NICKNAME"); fi
if [ -n "$SIGNATURE" ]; then NODE_ARGS+=(--signature "$SIGNATURE"); fi
if [ -n "$LEVEL" ]; then NODE_ARGS+=(--level "$LEVEL"); fi
if [ -n "$STATUS" ]; then NODE_ARGS+=(--status "$STATUS"); fi
if [ -n "$ASSISTANT" ]; then
  prepare_image "$ASSISTANT" "$temporary_dir/assistant.png"
  NODE_ARGS+=(--assistant "$temporary_dir/assistant.png")
fi
if [ -n "$QQ_SHOW" ]; then
  prepare_image "$QQ_SHOW" "$temporary_dir/qq-show.png"
  NODE_ARGS+=(--qq-show "$temporary_dir/qq-show.png")
fi
"$NODE" "${NODE_ARGS[@]}" >/dev/null

active_id="$({ "$NODE" -e 'try{const t=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(t.id||"")}catch{}' "$THEME_DIR/theme.json"; } 2>/dev/null || true)"
case "$active_id" in
  preset-codex-1907-deep)
    if [ "$APPLY_NOW" = "true" ]; then "$SCRIPT_DIR/switch-theme-macos.sh" --id "$active_id"; fi
    ;;
esac
printf 'Codex 2007 deep-skin personalization updated.\n'
