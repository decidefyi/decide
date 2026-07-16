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

assert_jsonrpc_success() {
  local label="$1"
  local body="$2"
  assert_contains "${label} jsonrpc" "$body" '"jsonrpc":"2.0"'
  assert_contains "${label} content" "$body" '"content":[{"type":"text"'
  assert_contains "${label} isError" "$body" '"isError":false'
}

echo "Checking MCP endpoints at ${BASE_URL}..."

policy_tools="$(post_json "/api/policy-mcp" '{"jsonrpc":"2.0","id":0,"method":"tools/list","params":{}}')"
for tool_name in refund_eligibility cancellation_penalty return_eligibility trial_terms; do
  assert_contains "policy MCP tools/list" "$policy_tools" "\"name\":\"${tool_name}\""
done

policy_call="$(post_json "/api/policy-mcp" '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"return_eligibility","arguments":{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}}}')"
assert_jsonrpc_success "policy MCP" "$policy_call"

refund="$(post_json "/api/mcp" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"refund_eligibility","arguments":{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}}}')"
assert_jsonrpc_success "refund MCP" "$refund"

cancel="$(post_json "/api/cancel-mcp" '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"cancellation_penalty","arguments":{"vendor":"adobe","region":"US","plan":"individual","billing_cadence":"annual"}}}')"
assert_jsonrpc_success "cancel MCP" "$cancel"

returns="$(post_json "/api/return-mcp" '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"return_eligibility","arguments":{"vendor":"adobe","days_since_purchase":5,"region":"US","plan":"individual"}}}')"
assert_jsonrpc_success "return MCP" "$returns"

trial="$(post_json "/api/trial-mcp" '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"trial_terms","arguments":{"vendor":"adobe","region":"US","plan":"individual"}}}')"
assert_jsonrpc_success "trial MCP" "$trial"

echo "All MCP checks passed."
