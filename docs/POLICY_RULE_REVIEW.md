# Policy Rule Review

The source tracker and the deterministic notaries have different jobs:

- the tracker detects and records source-page signals;
- a human reviewer decides whether those signals change a policy rule;
- only a reviewed, versioned repository change can alter a notary verdict.

## Review queue

1. Open the latest `policy-review-<run_id>` workflow artifact or query
   `GET https://api.decide.fyi/api/policy-alerts?state=all&limit=20`.
2. Select a `sample_details[].event_id` with `review_status=unreviewed`.
3. Open the event's `source_url` and verify the claimed semantic difference in
   the applicable US individual-plan context. Ignore page recency labels,
   processing times, unrelated regions, and unrelated product terms.
4. Choose one outcome:
   - `needs_followup`: the source is ambiguous or unavailable;
   - `reviewed_no_rule_change`: the source changed but the deterministic rule did not;
   - `dismissed_false_signal`: the tracker interpretation was incorrect;
   - `rulebook_updated`: a reviewed code change was deployed with a new rule version.
5. Record the outcome through **Actions -> Review policy event**, including the
   reviewer and evidence-based note.

`historical_unreviewed` identifies source signals recorded before this review
workflow launched. They remain available as audit evidence but are not mixed
into the live `unreviewed` queue. This label does not claim that a human
verified the underlying policy. The public API therefore excludes these events
from `state=confirmed`; query `state=review|all` to inspect them. A dismissed
historical signal remains visible in `sample_details[]` but no longer counts as
a policy change.

## Promote a real rule change

1. Update the applicable rulebook:
   - refund: `rules/v1_us_individual.json`
   - cancellation: `rules/v1_us_individual_cancel.json`
   - return: `rules/v1_us_individual_return.json`
   - trial: `rules/v1_us_individual_trial.json`
2. Update the matching `rules/*policy-sources.json` URL/notes and set
   `last_verified_utc` to the actual review time.
3. Advance `rules_version`; do not reuse a published rule version for changed behavior.
4. Run `npm run test:contract`, `npm run test:policy-check`, and the relevant
   REST/MCP smoke checks.
5. Merge and deploy the reviewed change.
6. Record the event as `rulebook_updated` with `rulebook_version` set to the
   deployed version.

Accepting the aggregation PR only updates monitoring baselines. It never counts
as deterministic rule approval.
