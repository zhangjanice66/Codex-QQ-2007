#!/bin/bash

set -euo pipefail

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || {
  printf 'Usage: %s <archive-root> [source-docs]\n' "$0" >&2
  exit 1
}

ARCHIVE_ROOT="$(cd "$1" && pwd -P)"
DOCS_SOURCE=""
if [ "$#" -eq 2 ]; then
  DOCS_SOURCE="$(cd "$2" && pwd -P)"
else
  SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
  for candidate in "$SCRIPT_ROOT/docs" "$SCRIPT_ROOT/../docs"; do
    if [ -f "$candidate/reference-background-prompt-guide.md" ]; then
      DOCS_SOURCE="$(cd "$candidate" && pwd -P)"
      break
    fi
  done

  # Codex QQ 2007 keeps only its product guide beside the macOS tree. Support
  # both the source repository and an already-flattened standalone archive.
  COMPACT_GUIDE=""
  COMPACT_NOTICE=""
  for candidate in "$SCRIPT_ROOT/docs" "$SCRIPT_ROOT/../docs"; do
    candidate_notice="$(cd "$candidate/.." 2>/dev/null && pwd -P)/NOTICE.md" || true
    if [ -f "$candidate/CODEX-1907.md" ] && [ -f "$candidate_notice" ]; then
      COMPACT_GUIDE="$candidate/CODEX-1907.md"
      COMPACT_NOTICE="$candidate_notice"
      break
    fi
  done
  if [ -z "$DOCS_SOURCE" ] && [ -n "$COMPACT_GUIDE" ]; then
    COMPACT_TARGET="$ARCHIVE_ROOT/docs/CODEX-1907.md"
    NOTICE_TARGET="$ARCHIVE_ROOT/NOTICE.md"
    /bin/mkdir -p "$ARCHIVE_ROOT/docs"
    if [ "$COMPACT_GUIDE" != "$COMPACT_TARGET" ]; then
      /bin/cp "$COMPACT_GUIDE" "$COMPACT_TARGET"
    fi
    if [ "$COMPACT_NOTICE" != "$NOTICE_TARGET" ]; then
      /bin/cp "$COMPACT_NOTICE" "$NOTICE_TARGET"
    fi

    temporary="${COMPACT_TARGET}.standalone"
    /usr/bin/sed \
      -e 's#^cd macos$#cd /path/to/codex-dream-skin-studio#' \
      "$COMPACT_TARGET" > "$temporary"
    /bin/mv "$temporary" "$COMPACT_TARGET"

    temporary="${NOTICE_TARGET}.standalone"
    /usr/bin/sed \
      -e 's#`macos/LICENSE`#`LICENSE`#g' \
      -e 's#`macos/presets/#`presets/#g' \
      -e 's#`macos/assets/#`assets/#g' \
      -e 's#`macos/scripts/#`scripts/#g' \
      -e 's#`docs/images/codex-qq-2007-preview.png` is a user-authorized runtime screenshot included for repository documentation only\.#`docs/images/codex-qq-2007-preview.png` is a repository-only runtime screenshot and is not included in this standalone archive.#' \
      "$NOTICE_TARGET" > "$temporary"
    /bin/mv "$temporary" "$NOTICE_TARGET"

    if /usr/bin/grep -E -q '(^cd macos$|`macos/(LICENSE|presets/|assets/|scripts/))' \
      "$COMPACT_TARGET" "$NOTICE_TARGET"; then
      printf 'Standalone QQ2007 documentation retains a repository-only macOS path.\n' >&2
      exit 1
    fi
    /usr/bin/grep -F -q 'is not included in this standalone archive' "$NOTICE_TARGET" || {
      printf 'Standalone NOTICE does not identify the repository-only preview.\n' >&2
      exit 1
    }
    exit 0
  fi
fi
[ -n "$DOCS_SOURCE" ] || {
  printf 'Could not locate the prompt documentation beside the macOS tree.\n' >&2
  exit 1
}
DOCS_TARGET="$ARCHIVE_ROOT/docs"

for name in \
  reference-background-prompt-guide.md \
  reference-background-prompt-guide.en.md \
  background-generation-prompts.md; do
  [ -f "$DOCS_SOURCE/$name" ] || {
    printf 'Required prompt documentation is missing: %s\n' "$DOCS_SOURCE/$name" >&2
    exit 1
  }
done
[ -d "$DOCS_SOURCE/images/gallery" ] || {
  printf 'Required concept gallery is missing: %s\n' "$DOCS_SOURCE/images/gallery" >&2
  exit 1
}
[ -d "$DOCS_SOURCE/images/presets" ] || {
  printf 'Required preset previews are missing: %s\n' "$DOCS_SOURCE/images/presets" >&2
  exit 1
}
[ -f "$DOCS_SOURCE/images/hero-banner-red-white.png" ] || {
  printf 'Required prompt reference image is missing: %s\n' \
    "$DOCS_SOURCE/images/hero-banner-red-white.png" >&2
  exit 1
}
[ -f "$ARCHIVE_ROOT/NOTICE.md" ] || {
  printf 'Standalone NOTICE is missing: %s\n' "$ARCHIVE_ROOT/NOTICE.md" >&2
  exit 1
}

/bin/mkdir -p "$DOCS_TARGET/images"
/bin/cp "$DOCS_SOURCE/reference-background-prompt-guide.md" \
  "$DOCS_SOURCE/reference-background-prompt-guide.en.md" \
  "$DOCS_SOURCE/background-generation-prompts.md" \
  "$DOCS_TARGET/"
if [ -f "$DOCS_SOURCE/CODEX-1907.md" ]; then
  /bin/cp "$DOCS_SOURCE/CODEX-1907.md" "$DOCS_TARGET/"
fi
/bin/cp -R "$DOCS_SOURCE/images/gallery" "$DOCS_TARGET/images/"
/bin/cp -R "$DOCS_SOURCE/images/presets" "$DOCS_TARGET/images/"
/bin/cp "$DOCS_SOURCE/images/hero-banner-red-white.png" "$DOCS_TARGET/images/"
if [ -f "$DOCS_SOURCE/images/sponsor-passion8.png" ]; then
  /bin/cp "$DOCS_SOURCE/images/sponsor-passion8.png" "$DOCS_TARGET/images/"
fi

# Prompt guides are authored from the repository root. The macOS tree becomes
# the root of standalone archives, while Windows files remain repository-only.
WINDOWS_ASSET_URL='https://github.com/Fei-Away/Codex-Dream-Skin/blob/main/windows/assets/'
WINDOWS_ASSET_TOKEN='__CODEX_DREAM_SKIN_WINDOWS_ASSET_URL__'
for file in "$DOCS_TARGET"/*.md; do
  temporary="${file}.standalone"
  /usr/bin/sed \
    -e 's#macos/presets/#presets/#g' \
    -e 's#macos/assets/#assets/#g' \
    -e 's#macos/NOTICE\.md#NOTICE.md#g' \
    -e "s#${WINDOWS_ASSET_URL}#${WINDOWS_ASSET_TOKEN}#g" \
    -e "s#https://github.com/Fei-Away/Codex-Dream-Skin/tree/main/windows/assets/#${WINDOWS_ASSET_TOKEN}#g" \
    -e "s#windows/assets/#${WINDOWS_ASSET_URL}#g" \
    -e "s#${WINDOWS_ASSET_TOKEN}#${WINDOWS_ASSET_URL}#g" \
    "$file" > "$temporary"
  /bin/mv "$temporary" "$file"
done

# NOTICE.md is also authored from macos/, so make its inventory truthful for
# a macOS-only archive and retain the Windows entry as repository-only scope.
NOTICE="$ARCHIVE_ROOT/NOTICE.md"
temporary="${NOTICE}.standalone"
/usr/bin/sed \
  -e 's#`\.\./docs/#`docs/#g' \
  -e 's#- `\.\./windows/assets/dream-reference.jpg`#- `windows/assets/dream-reference.jpg` (full repository only; not included in this macOS archive)#' \
  -e "s#They are included at the maintainer's direction as a local theme preset, source archive, and real runtime previews\.#The macOS preset and documentation images are included at the maintainer's direction as a local theme preset, source archive, and real runtime previews. The Windows counterpart is listed for full-repository license coverage and is not included in this macOS archive.#" \
  "$NOTICE" > "$temporary"
/bin/mv "$temporary" "$NOTICE"

for file in "$DOCS_TARGET"/*.md; do
  if /usr/bin/grep -E -q 'macos/(presets|assets)/|macos/NOTICE\.md' "$file"; then
    printf 'Standalone prompt guide retains a repository-only macOS path: %s\n' "$file" >&2
    exit 1
  fi
done
if /usr/bin/grep -E -q '`\.\./(docs|windows)/' "$NOTICE"; then
  printf 'Standalone NOTICE retains a parent-repository path: %s\n' "$NOTICE" >&2
  exit 1
fi
/usr/bin/grep -F -q 'not included in this macOS archive' "$NOTICE" || {
  printf 'Standalone NOTICE does not identify the repository-only Windows asset.\n' >&2
  exit 1
}
