# Policy Checker + Supabase

This repo supports dual-write and optional state hydration/sync from Supabase for the daily policy checker.

## 1) Bootstrap schema

Run the SQL in:

- `docs/sql/policy_supabase.sql`

It creates:

- `policy_events` (deduped change events; primary key `event_id`)
- `policy_daily_alerts` (one row per UTC date)
- `policy_state_artifacts` (serialized checker state blobs by file path)

## 2) Runtime secrets/vars

Set these in your deployment and GitHub Actions context:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional flags:

- `POLICY_SUPABASE_SYNC_ENABLED=1`
- `POLICY_SUPABASE_STATE_SYNC_ENABLED=1`
- `POLICY_SUPABASE_SUPPRESS_GIT_STATE=1`
- `POLICY_ALERT_INCLUDE_ZERO_CHANGE=1` (recommended; default now `1`)
- `POLICY_ALERTS_ALLOW_FILE_FALLBACK=0|1` (default: `0` in production, `1` elsewhere)

## 3) Behavior

When enabled:

- `scripts/check-policies.js` hydrates local state from `policy_state_artifacts` before checks.
- It upserts daily events into `policy_events`.
- It upserts daily rollup into `policy_daily_alerts`.
- It enforces daily date continuity for recent history (`POLICY_ALERT_CONTINUITY_LOOKBACK_DAYS`, default `120`):
  - if a UTC date is missing, a zero-change continuity row is backfilled.
- It re-syncs artifact state into `policy_state_artifacts`.
- Comparison mode is `confirmed_daily_fingerprint`:
  - diffing prefers confirmed baseline + canonical daily fingerprints (`rules/*-policy-daily-fingerprints.json`)
  - transient run-hash drift is excluded from baseline comparison.
- Blocked-source retry queues are persisted as state artifacts (`rules/*-policy-blocked-retry-queue.json`).
- Public strict feed remains date-continuous (including zero-change days); provisional/quality-held/fetch telemetry stays internal (`raw` payload/ops reports).

Workflow behavior:

- if Supabase sync is healthy and suppression flag is enabled, high-churn state files are not committed to `policy-updates/aggregate`.

## 4) API

- `GET /api/policy-alerts`
- Query params:
  - `state=confirmed|review|all` (default `confirmed`)
  - `limit` (default `20`, max `100`)
  - `include_zero=1|0` (default `1`; set `0` to hide zero-change daily rows)
  - `date_from=YYYY-MM-DD`
  - `date_to=YYYY-MM-DD`

If Supabase sync is enabled, this route reads from `policy_daily_alerts`.
File fallback is disabled by default in production (`POLICY_ALERTS_ALLOW_FILE_FALLBACK=0`) and enabled by default in non-production.

Response contract:

- top-level `schema_version=policy_alerts_v2`
- top-level `source` is a string (`supabase` or `file_fallback`)
- top-level `state`, `limit`, `alerts[]`
- each alert should include normalized `date_utc`, `changed_count`, `pending_count`, `state`, `status`, `run_url`

Workflow bridge guard:

- `Daily Policy Check` now runs `npm run verify:policy-alerts-bridge` after a healthy Supabase sync.
- This guard verifies the live public API contract and confirms the current workflow run is visible in `/api/policy-alerts`.
- By default this guard is warning-only (`POLICY_ALERTS_BRIDGE_ENFORCE=0`).
- Set repo variable `POLICY_ALERTS_BRIDGE_ENFORCE=1` to make bridge failures block the workflow.
