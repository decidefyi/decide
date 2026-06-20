#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}"
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

is_reachable() {
  curl -sS --max-time 2 -o /dev/null "${BASE_URL}/api/mcp" >/dev/null 2>&1
}

if is_reachable; then
  echo "Using existing local server at ${BASE_URL}."
  BASE_URL="${BASE_URL}" bash scripts/mcp-check.sh
  exit 0
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
  if is_reachable; then
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

echo "Timed out waiting for ${BASE_URL}/api/mcp after ${WAIT_SECONDS}s."
tail -n 40 "${LOG_FILE}" || true
exit 1
