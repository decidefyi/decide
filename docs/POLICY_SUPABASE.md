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
- Human review is stored on the stable `policy_events.event_id`; tracker upserts do not promote policy text into rulebooks.
- It upserts daily rollup into `policy_daily_alerts`.
- It enforces daily date continuity for recent history (`POLICY_ALERT_CONTINUITY_LOOKBACK_DAYS`, default `120`):
  - if a UTC date is missing, a zero-change continuity row is backfilled.
- It re-syncs artifact state into `policy_state_artifacts`.
- Comparison mode is `confirmed_daily_fingerprint`:
  - diffing prefers confirmed baseline + canonical daily fingerprints (`rules/*-policy-daily-fingerprints.json`)
  - transient run-hash drift is excluded from baseline comparison.
- Blocked-source retry queues are persisted as state artifacts (`rules/*-policy-blocked-retry-queue.json`).
- New non-zero detections are written as `review_required` and stay out of the
  strict file feed until adjudicated; zero-change continuity rows remain strict.
  The Supabase-backed API promotes reviewed events dynamically, while
  provisional/quality-held/fetch telemetry stays internal (`raw` payload/ops
  reports).

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
- top-level `trust_model=review_gated_change_claims_v1`
- top-level `source` is a string (`supabase` or `file_fallback`)
- top-level `state`, `limit`, `alerts[]`
- each alert should include normalized `date_utc`, `changed_count`, `pending_count`, `state`, `status`, `run_url`, `rulebook_status`, `decision_rule_impact`, and `sample_details[]`
- each new sample detail includes `event_id`, `review_status`, and `rulebook_updated`; the API overlays recorded Supabase review decisions onto daily rollups
- a non-zero change claim is eligible for `state=confirmed` only when every
  detected event has an adjudicated review status (`reviewed_no_rule_change` or
  `rulebook_updated`)
- unresolved or incomplete evidence is returned only by `state=review|all` with
  `status=review`, `state=needs_review`, and `signal_confidence=manual-review`
- `dismissed_false_signal` details remain in `sample_details[]` for audit, but
  are removed from `changed_count`, `changed_sample`, and `by_policy`
- the daily writer stores new change rows with `strict_eligible=false`,
  `status=review`, and `change_review_state=review_required`; after all linked
  events are adjudicated, the API promotes the row without rewriting history
- additive audit counters distinguish the stages: `detected_changed_count`,
  `confirmed_changed_count`, `unresolved_changed_count`, and
  `dismissed_signal_count`
- zero-change continuity rows retain their checker quality classification and do
  not require event review because they make no policy-change claim

## 5) Review a policy event

Preview an update locally:

```bash
npm run review:policy-event -- \
  --event-id 'refund:vendor:confirmed_hash' \
  --status reviewed_no_rule_change \
  --reviewed-by 'operator@example.com' \
  --note 'Verified the source; deterministic rule is unchanged.'
```

Add `--apply` only after reviewing the preview and loading `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. The repository also provides the manual **Review
policy event** GitHub workflow, which uses the same validator with repository
secrets. `rulebook_updated` requires `--rulebook-version` and should only be
recorded after the corresponding reviewed rule change is deployed.

Workflow bridge guard:

- `Daily Policy Check` runs `npm run verify:policy-alerts-bridge` against both `www.decide.fyi` and canonical `api.decide.fyi` after a healthy Supabase sync.
- Both guards verify the live API contract and confirm the current workflow run is visible in `/api/policy-alerts`.
- The website bridge is warning-only by default (`POLICY_ALERTS_BRIDGE_ENFORCE=0`); set `POLICY_ALERTS_BRIDGE_ENFORCE=1` to make it blocking.
- The canonical API guard is always blocking after a healthy sync so production configuration drift cannot silently disable the feed.
