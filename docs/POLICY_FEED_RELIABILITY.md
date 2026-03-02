# Policy Feed Reliability

Policy feed publication is driven by `scripts/check-policies.js` and helper logic in `scripts/lib/policy-feed-reliability.js`.

## Reliability safeguards

1. Idempotent signature
   - Each alert entry gets a deterministic `alert_signature` from key counters/samples.
2. Duplicate suppression
   - If the latest feed entry has the same signature, publication is skipped (`duplicate_latest`).
3. Low-signal thresholding
   - Repeated low-signal diffs are suppressed (`low_signal_repeat`) using configurable lookback.
4. Bounded feed size
   - Feed history is capped (`POLICY_ALERT_FEED_MAX_ENTRIES`, max 366).

## Tunables

- `POLICY_ALERT_FEED_MAX_ENTRIES` (default `120`)
- `POLICY_ALERT_LOW_SIGNAL_THRESHOLD` (default `1`)
- `POLICY_ALERT_LOW_SIGNAL_LOOKBACK` (default `6`)

## Failure modes and recovery

1. Feed write skipped unexpectedly
   - Check run output keys:
     - `ALERT_FEED_PUBLISHED`
     - `ALERT_FEED_REASON`
     - `ALERT_FEED_SIGNATURE`
     - `ALERT_FEED_CHANGED`
   - Verify whether suppression was expected (`duplicate_latest` or `low_signal_repeat`).

2. Excessive noisy alerts
   - Increase `POLICY_ALERT_LOW_SIGNAL_LOOKBACK`.
   - Optionally increase `POLICY_ALERT_LOW_SIGNAL_THRESHOLD`.

3. Legitimate changes not surfacing
   - Lower `POLICY_ALERT_LOW_SIGNAL_THRESHOLD`.
   - Validate `changed_count`/`by_policy` emission from checker output.

4. Corrupt feed format
   - Restore `rules/policy-alert-feed.json` from last good commit.
   - Re-run `node scripts/check-policies.js`.
   - Run `npm run test:policy-feed`.
