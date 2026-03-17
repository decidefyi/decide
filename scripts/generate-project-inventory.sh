#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_NAME="$(basename "$ROOT_DIR")"
STOCKHOLM_TS="$(TZ=Europe/Stockholm date '+%Y-%m-%d %H:%M:%S %Z')"
ISO_TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

FUNC_PATTERN='export default|export async function|export function|function [A-Za-z0-9_]+\(|const [A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>|const [A-Za-z0-9_]+\s*=\s*async\s*\([^)]*\)\s*=>'
FUNC_PATTERN_CJS="${FUNC_PATTERN}|module\\.exports\\s*=\\s*async|module\\.exports\\s*=\\s*function|module\\.exports\\s*=\\s*\\("

FUNCTION_MAP="$ROOT_DIR/FUNCTION_INTERCONNECTIONS.md"
OUTBOUND_MAP="$ROOT_DIR/OUTBOUND_DOMAIN_INVENTORY.md"
OUTBOUND_ISSUES="$ROOT_DIR/OUTBOUND_URL_PARSE_ISSUES.md"

scan_targets=()
for p in api app components lib data client scripts; do
  if [[ -d "$p" ]]; then
    scan_targets+=("$p")
  fi
done
if [[ "${#scan_targets[@]}" -eq 0 ]]; then
  scan_targets=(".")
fi

sorted_rg() {
  (rg "$@" || true) | LC_ALL=C sort
}

cat > "$FUNCTION_MAP" <<DOC
# Function Inventory + Interconnection Map

Generated: ${STOCKHOLM_TS}

## Scope

This is the repo-local function and dependency map for \
\`${REPO_NAME}\`.

Companion artifacts:

- [OUTBOUND_DOMAIN_INVENTORY.md](OUTBOUND_DOMAIN_INVENTORY.md)
- [OUTBOUND_URL_PARSE_ISSUES.md](OUTBOUND_URL_PARSE_ISSUES.md)

## Function Surface

### Scan targets

\`$(printf '%s ' "${scan_targets[@]}")\`

### Function declarations

\`\`\`text
DOC

{
  sorted_rg -n "$FUNC_PATTERN_CJS" "${scan_targets[@]}"
  echo '```'
  echo
  echo '### Import/require graph'
  echo
  echo '```text'
  sorted_rg -n "^import |require\\(" "${scan_targets[@]}"
  echo '```'
  echo

  if [[ -f "index.html" ]]; then
    echo '### Frontend script load graph (`index.html`)'
    echo
    echo '```text'
    sorted_rg -n "<script[^>]+src=" "index.html"
    echo '```'
    echo
  fi

  if [[ -f "public/index.html" ]]; then
    echo '### Frontend script load graph (`public/index.html`)'
    echo
    echo '```text'
    sorted_rg -n "<script[^>]+src=" "public/index.html"
    echo '```'
    echo
  fi

  echo '## Regeneration Commands'
  echo
  echo '```bash'
  echo './scripts/generate-project-inventory.sh'
  echo './scripts/check-project-inventory.sh'
  echo '```'
} >> "$FUNCTION_MAP"

RAW_URLS_FILE="$(mktemp)"
trap 'rm -f "$RAW_URLS_FILE"' EXIT

{
  rg --no-messages -n -o "https?://[A-Za-z0-9._~:/?#\\[\\]@!$&'()*+,;=%-]+" . \
    -g '!**/node_modules/**' \
    -g '!**/.git/**' \
    -g '!**/.next/**' \
    -g '!**/package-lock.json' \
    -g '!**/yarn.lock' \
    -g '!**/pnpm-lock.yaml' \
    -g '!**/*.png' \
    -g '!**/*.jpg' \
    -g '!**/*.jpeg' \
    -g '!**/*.gif' \
    -g '!**/*.ico' \
    -g '!**/*.svg' \
    -g '!**/*.webp' \
    -g '!FUNCTION_INTERCONNECTIONS.md' \
    -g '!OUTBOUND_DOMAIN_INVENTORY.md' \
    -g '!OUTBOUND_URL_PARSE_ISSUES.md' || true
} | LC_ALL=C sort > "$RAW_URLS_FILE"

node "$ROOT_DIR/scripts/generate-outbound-domain-inventory.mjs" \
  --input "$RAW_URLS_FILE" \
  --output "$OUTBOUND_MAP" \
  --issues "$OUTBOUND_ISSUES" \
  --repo "$REPO_NAME"

echo "[generate-project-inventory] Generated at ${ISO_TS}" >&2
echo "[generate-project-inventory] Updated:" >&2
echo "- $FUNCTION_MAP" >&2
echo "- $OUTBOUND_MAP" >&2
echo "- $OUTBOUND_ISSUES" >&2
