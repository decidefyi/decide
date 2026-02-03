#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

post_json() {
  local path="$1"
  local payload="$2"
  curl -sS -X POST "${BASE_URL}${path}" \
    -H "Content-Type: application/json" \
    --data-binary "$payload"
}

assert_contains() {
  local label="$1"
  local body="$2"
  local needle="$3"
  if [[ "$body" != *"$needle"* ]]; then
    echo "FAIL ${label}: expected response to contain '${needle}'"
    echo "Response: ${body}"
    exit 1
  fi
  echo "PASS ${label}"
}

echo "Checking MCP endpoints at ${BASE_URL}..."

refund="$(post_json "/api/mcp" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"refund_eligibility","arguments":{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}}}')"
assert_contains "refund MCP" "$refund" '"isError":false'
assert_contains "refund MCP verdict" "$refund" 'Refund Eligibility: ALLOWED'

cancel="$(post_json "/api/cancel-mcp" '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cancellation_penalty","arguments":{"vendor":"adobe","region":"US","plan":"individual"}}}')"
assert_contains "cancel MCP" "$cancel" '"isError":false'
assert_contains "cancel MCP verdict" "$cancel" 'Cancellation Status: PENALTY'

returns="$(post_json "/api/return-mcp" '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"return_eligibility","arguments":{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}}}')"
assert_contains "return MCP" "$returns" '"isError":false'
assert_contains "return MCP verdict" "$returns" 'Return Eligibility: RETURNABLE'

trial="$(post_json "/api/trial-mcp" '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"trial_terms","arguments":{"vendor":"adobe","region":"US","plan":"individual"}}}')"
assert_contains "trial MCP" "$trial" '"isError":false'
assert_contains "trial MCP verdict" "$trial" 'Trial Terms: TRIAL_AVAILABLE'

echo "All MCP checks passed."
