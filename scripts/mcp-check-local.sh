#!/usr/bin/env bash
set -euo pipefail

REQUESTED_BASE_URL="${BASE_URL:-}"
BASE_URL="${REQUESTED_BASE_URL%/}"
WAIT_SECONDS="${MCP_CHECK_LOCAL_WAIT_SECONDS:-90}"
LOG_FILE="$(mktemp -t decide-vercel-dev.XXXXXX.log)"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${LOG_FILE}"
}
trap cleanup EXIT

is_http_reachable() {
  curl -sS --max-time 2 -o /dev/null "${BASE_URL}/api/policy-mcp" >/dev/null 2>&1
}

is_decide_mcp_ready() {
  local body
  body="$(
    curl -sS --max-time 3 -X POST "${BASE_URL}/api/policy-mcp" \
      -H "Content-Type: application/json" \
      --data-binary '{"jsonrpc":"2.0","id":0,"method":"tools/list","params":{}}' \
      2>/dev/null || true
  )"
  [[ "${body}" == *'"name":"refund_eligibility"'* ]] &&
    [[ "${body}" == *'"name":"cancellation_penalty"'* ]] &&
    [[ "${body}" == *'"name":"return_eligibility"'* ]] &&
    [[ "${body}" == *'"name":"trial_terms"'* ]]
}

if [[ -z "${BASE_URL}" ]]; then
  port="$(
    node -e '
      const net = require("node:net");
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        console.log(server.address().port);
        server.close();
      });
    '
  )"
  BASE_URL="http://127.0.0.1:${port}"
elif is_decide_mcp_ready; then
  echo "Using verified Decide MCP server at ${BASE_URL}."
  BASE_URL="${BASE_URL}" bash scripts/mcp-check.sh
  exit 0
elif is_http_reachable; then
  echo "A non-Decide service is already responding at ${BASE_URL}."
  echo "Unset BASE_URL to let mcp:check:local claim an isolated port."
  exit 1
fi

port="$(
  BASE_URL="${BASE_URL}" node -e '
    const value = process.env.BASE_URL;
    const url = new URL(value);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      console.error(`mcp:check:local only starts localhost servers, got ${value}`);
      process.exit(2);
    }
    console.log(url.port || (url.protocol === "https:" ? "443" : "80"));
  '
)"

echo "Starting Vercel dev for MCP checks at ${BASE_URL}..."
vercel dev --listen "127.0.0.1:${port}" >"${LOG_FILE}" 2>&1 &
SERVER_PID="$!"

for _ in $(seq 1 "${WAIT_SECONDS}"); do
  if is_decide_mcp_ready; then
    BASE_URL="${BASE_URL}" bash scripts/mcp-check.sh
    exit 0
  fi

  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    echo "Vercel dev exited before MCP checks could run."
    tail -n 40 "${LOG_FILE}" || true
    exit 1
  fi

  sleep 1
done

echo "Timed out waiting for ${BASE_URL}/api/policy-mcp after ${WAIT_SECONDS}s."
tail -n 40 "${LOG_FILE}" || true
exit 1
