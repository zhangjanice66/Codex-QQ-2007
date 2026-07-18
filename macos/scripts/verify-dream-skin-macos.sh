#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PORT=9341
PORT_EXPLICIT="false"
SCREENSHOT=""
RELOAD="false"
MATRIX_DIR=""
SCENARIO=""
SANITIZED="false"
LIFECYCLE_OUTPUT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; PORT_EXPLICIT="true"; shift 2 ;;
    --screenshot) SCREENSHOT="${2:-}"; shift 2 ;;
    --reload) RELOAD="true"; shift ;;
    --matrix-dir) MATRIX_DIR="${2:-}"; shift 2 ;;
    --scenario) SCENARIO="${2:-}"; shift 2 ;;
    --sanitized) SANITIZED="true"; shift ;;
    --lifecycle-smoke) LIFECYCLE_OUTPUT="${2:-}"; shift 2 ;;
    *) fail "Unknown verify argument: $1" ;;
  esac
done

[ -z "$MATRIX_DIR" ] || [ -z "$LIFECYCLE_OUTPUT" ] || fail "Matrix and lifecycle modes cannot run together."
[ -z "$MATRIX_DIR" ] || { [ -n "$SCENARIO" ] && [ "$SANITIZED" = "true" ]; } || \
  fail "Matrix mode requires --matrix-dir, --scenario, and --sanitized."
[ -n "$MATRIX_DIR" ] || { [ -z "$SCENARIO" ] && [ "$SANITIZED" = "false" ]; } || \
  fail "--scenario and --sanitized require --matrix-dir."
[ -z "$LIFECYCLE_OUTPUT" ] || { [ -z "$SCREENSHOT" ] && [ "$RELOAD" = "false" ]; } || \
  fail "Lifecycle mode cannot be combined with screenshot or reload."

discover_codex_app
require_macos_runtime
if [ "$PORT_EXPLICIT" = "false" ] && [ -f "$STATE_PATH" ]; then
  PORT="$(state_field port)"
fi
verified_cdp_endpoint "$PORT" || fail "Port $PORT is not a verified Codex loopback CDP endpoint."

if [ -n "$MATRIX_DIR" ]; then
  ARGS=("$INJECTOR" --matrix-dir "$MATRIX_DIR" --scenario "$SCENARIO" --sanitized \
    --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 30000)
elif [ -n "$LIFECYCLE_OUTPUT" ]; then
  ARGS=("$INJECTOR" --lifecycle-smoke --lifecycle-output "$LIFECYCLE_OUTPUT" \
    --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 30000)
else
  ARGS=("$INJECTOR" --verify --port "$PORT" --theme-dir "$THEME_DIR" --timeout-ms 30000)
  [ -n "$SCREENSHOT" ] && ARGS+=(--screenshot "$SCREENSHOT")
  [ "$RELOAD" = "true" ] && ARGS+=(--reload)
fi
exec "$NODE" "${ARGS[@]}"
