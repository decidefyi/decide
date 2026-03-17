#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILES=(
  "FUNCTION_INTERCONNECTIONS.md"
  "OUTBOUND_DOMAIN_INVENTORY.md"
  "OUTBOUND_URL_PARSE_ISSUES.md"
)

hash_text() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    echo "Missing shasum/sha256sum" >&2
    exit 2
  fi
}

hash_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    sed -E '/^Generated(:| at:)/d' "$path" | hash_text
  else
    echo "__MISSING__"
  fi
}

BEFORE_HASHES=()
for f in "${FILES[@]}"; do
  BEFORE_HASHES+=("$(hash_file "$f")")
done

log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT
"$ROOT_DIR/scripts/generate-project-inventory.sh" >"$log_file" 2>&1 || {
  cat "$log_file" >&2
  exit 1
}

changed=0
for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  before_hash="${BEFORE_HASHES[$i]}"
  after_hash="$(hash_file "$f")"
  if [[ "$before_hash" != "$after_hash" ]]; then
    changed=1
    echo "stale: $f"
  fi
done

if [[ "$changed" -ne 0 ]]; then
  echo
  echo "Inventory docs are stale. Regenerated files differ from committed versions."
  echo "Run: ./scripts/generate-project-inventory.sh"
  exit 1
fi

echo "Inventory docs are up to date."
