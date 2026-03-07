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

## 3) Behavior

When enabled:

- `scripts/check-policies.js` hydrates local state from `policy_state_artifacts` before checks.
- It upserts daily events into `policy_events`.
- It upserts daily rollup into `policy_daily_alerts`.
- It re-syncs artifact state into `policy_state_artifacts`.
- Comparison mode is `confirmed_daily_fingerprint`:
  - diffing prefers confirmed baseline + canonical daily fingerprints (`rules/*-policy-daily-fingerprints.json`)
  - transient run-hash drift is excluded from baseline comparison.
- Blocked-source retry queues are persisted as state artifacts (`rules/*-policy-blocked-retry-queue.json`).

Workflow behavior:

- if Supabase sync is healthy and suppression flag is enabled, high-churn state files are not committed to `policy-updates/aggregate`.

## 4) API

- `GET /api/policy-alerts`
- Query params:
  - `state=confirmed|review|all` (default `confirmed`)
  - `limit` (default `20`, max `100`)
  - `date_from=YYYY-MM-DD`
  - `date_to=YYYY-MM-DD`

If Supabase sync is enabled, this route reads from `policy_daily_alerts`. Otherwise it falls back to local file feeds.
